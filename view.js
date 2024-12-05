import deepmerge     from '@superhero/deep/merge'
import { Transform } from 'node:stream'

/**
 * A view model is a data model specifically designed for the view layer to 
 * manage the data that is presented to the client.
 * 
 * @memberof @superhero/http-server
 */
export default class View
{
  #stream
  #downstream

  /**
   * The constructor method is designed to limit access to the view model properties 
   * to prevent unpredicted behaviour if the view model is used incorrectly.
   */
  constructor(session)
  {
    const downstream = session.downstream
    this.#downstream = downstream

    const headers = new Proxy({},
    {
      get             : (target, prop) => target[prop] ?? downstream.getHeader(prop),
      set             : (_, prop, val) => downstream.setHeader(prop, val) || true,
      has             : (_, prop)      => downstream.hasHeader(prop),
      deleteProperty  : (_, prop)      => downstream.removeHeader(prop),
      ownKeys         : ()             => downstream.getHeaderNames()
    })

    Object.defineProperties(headers,
    {
      addTrailers     : { value:downstream.addTrailers    .bind(downstream) },
      appendHeader    : { value:downstream.appendHeader   .bind(downstream) },
      flushHeaders    : { value:downstream.flushHeaders   .bind(downstream) },
      getHeader       : { value:downstream.getHeader      .bind(downstream) },
      getHeaderNames  : { value:downstream.getHeaderNames .bind(downstream) },
      getHeaders      : { value:downstream.getHeaders     .bind(downstream) },
      hasHeader       : { value:downstream.hasHeader      .bind(downstream) },
      removeHeader    : { value:downstream.removeHeader   .bind(downstream) },
      setHeader       : { value:downstream.setHeader      .bind(downstream) },
      writeEarlyHints : { value:downstream.writeEarlyHints.bind(downstream) },
      writeHead       : { value:downstream.writeHead      .bind(downstream) },
      headersSent     : { get:() => downstream.headersSent }
    })

    let body = {}
    Object.defineProperties(this,
    {
      // The body property is an object that represents the response body.
      body    : { enumerable: true, get: () => body, set: (value) => body = deepmerge(body, value) },
      // The stream property is a transform stream in object mode that by default encodes objects 
      // as stringified JSON data records according to HTML5 standard Server-Sent Events (SSE).
      stream  : { enumerable: true, configurable: true, get: () => this.#lazyloadStream },
      // The headers property is an object that represents the response headers.
      headers : { enumerable: true, value: headers },
      // The session property has a reference to this view object, not enumerable because 
      // it's a circular reference.
      session : { value: session },
      // The status property is an integer representing the status code of the HTTP response.
      status  : { enumerable : true,
                  get : ()        => downstream.statusCode,
                  set : (status)  => downstream.statusCode = status }
    })

    // Prevent the view model from being missused accidentally by providing a proxy that throws
    // an error if a property is accessed that is not already defined.
    return new Proxy(this,
    {
      get: (_, property) => 
      {
        if(this[property] instanceof Function)
        {
          return this[property].bind(this)
        }
        else if(property in this)
        {
          return this[property]
        }
        else
        {
          const error = new ReferenceError(`Reading an invalid view model property: "${property}"`)
          error.code  = 'E_HTTP_SERVER_VIEW_MODEL_PROPERTY_NOT_READABLE'
          error.cause = `Valid properties: ${Object.keys(this).map((prop) => `"${prop}"`).join(', ')}`
          throw error
        }
      },
      set: (_, property, value) =>
      {
        const descriptor = Object.getOwnPropertyDescriptor(this, property)

        if(descriptor?.writable
        || descriptor?.set)
        {
          this[property] = value
          return true
        }
        else
        {
          const error = new Error(`View model property "${property}" is not writable`)
          error.code  = 'E_HTTP_SERVER_VIEW_MODEL_PROPERTY_NOT_WRITABLE'
          throw error
        }
      }
    })
  }

  /**
   * The stream property is a transform stream in object mode that by 
   * default encodes objects as stringified JSON data records 
   * according to HTML5 standard Server-Sent Events (SSE).
   * 
   * @returns {node:stream.Transform} @lazyload the channel transform stream.
   * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
   */
  get #lazyloadStream()
  {
    if(this.#stream)
    {
      return this.#stream
    }
    
    this.#stream = new Transform(
    {
      objectMode  : true,
      transform   : (obj, _, callback) => 
      {
        try
        {
          const stringifed = JSON.stringify(obj)
          callback(null, `data: ${stringifed}\n\n`)
        }
        catch(reason)
        {
          const error = new TypeError(`Failed to encode object using JSON.stringify`)
          error.code  = 'E_HTTP_SERVER_VIEW_MODEL_CHANNEL_TRANSFORM_FAILED'
          error.cause = reason
          callback(error)
        }
      }
    })

    this.headers['content-type'] = 'text/event-stream'
    this.#stream.pipe(this.#downstream)
    return this.#stream
  }

  /**
   * The present method is called to present the view model body to the client.
   * This implementation will present the view model as a stringified JSON.
   * 
   * - If the request has been aborted, the present method will return early without making any operation.
   * - If the content type is not set, it will be set to "application/json".
   * - If the status code is greater than or equal to 400, the body will be presented as an error.
   * 
   * @returns {void}
   */
  present()
  {
    // can't present if the downstream is not writable
    if(this.#downstream.writableEnded)
    {
      return
    }

    if(false === this.headers.headersSent
    && false === this.headers.hasHeader('content-type'))
    {
      this.headers['content-type'] = 'application/json'
    }

    // stringify the body and end the downstream
    this.#downstream.end(JSON.stringify(this.body))
  }

  /**
   * The presentError method is called to present an error to the client.
   * This implementation will present the error as a stringified JSON.
   *
   * @param {Error} error The error to present.
   *
   * @returns {void}
   */
  presentError(error)
  {
    // Can't present if the downstream is not writable.
    if(this.#downstream.writableEnded)
    {
      return
    }

    // Set the headers defined by the error if not already sent.
    if(false === this.headers.headersSent)
    {
      if('[object Object]' === Object.prototype.toString.call(error.headers))
      {
        for(const header in error.headers)
        {
          this.headers[header] = error.headers[header]
        }
      }

      if(false === this.headers.hasHeader('content-type'))
      {
        this.headers['content-type'] = 'application/json'
      }
    }

    this.status  = error.statusCode ?? error.status ?? 500

    const output =
    {
      status  : this.status,
      error   : error.message,
      code    : error.code,
      details : []
    }

    // Add the error causes to the details using recursion.
    this.#addDetailToOutput(error.cause, output)

    // Remove the details property if it's empty for a cleaner output.
    if(output.details.length === 0)
    {
      delete output.details
    }

    // Stringify the error and end the response.
    this.#downstream.end(JSON.stringify(output))
  }

  #addDetailToOutput(cause, output, seen = new WeakSet)
  {
    if(cause instanceof Object)
    {
      if(seen.has(cause)
      || false === !!cause)
      {
        return
      }
  
      seen.add(cause)
    }

    switch(Object.prototype.toString.call(cause))
    {
      case '[object Array]':
      {
        for(const detail of cause)
        {
          this.#addDetailToOutput(detail, output, seen)
        }
        break
      }
      case '[object Error]':
      {
        let detail = cause.message

        if(cause.code)
        {
          detail = `${cause.code} - ${detail}`
          detail = detail.trim()
        }

        output.details.push(detail)

        if(cause.cause)
        {
          this.#addDetailToOutput(cause.cause, output, seen)
        }

        break
      }
      case '[object Undefined]':
      {
        break
      }
      default:
      {
        cause = String(cause)
        output.details.push(cause)
        break
      }
    }
  }

  toJSON()
  {
    const 
      descriptors = Object.getOwnPropertyDescriptors(this),
      output      = {}

    for(const property in descriptors)
    {
      if(descriptors[property].enumerable)
      {
        output[property] = this[property]
      }
    }

    return Object(output)
  }

  // It's useful for debugging and logging to provide a more readable output.
  [Symbol.for('nodejs.util.inspect.custom')]()
  {
    return this.toJSON()
  }
}