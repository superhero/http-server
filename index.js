import View           from '@superhero/http-server/view'
import Router         from '@superhero/router'
import Log            from '@superhero/log'
import NameGenerator  from '@superhero/id-name-generator'
import http           from 'node:http'
import https          from 'node:https'
import http2          from 'node:http2'
import net            from 'node:net'
import tls            from 'node:tls'
import { URL }        from 'node:url'

export function locate(locator)
{
  const router = new Router(locator)
  return new HttpServer(router)
}

export default class HttpServer
{
  // Name the server to easier be able to identify what logs 
  // belong to what server in a clustered environment.
  name = new NameGenerator().generateName().toUpperCase()

  // Tracks request statistics
  // BigInt used for large numbers
  dispatched  = 0n
  completed   = 0n
  abortions   = 0n
  rejections  = 0n

  // Internal server log
  log = new Log({ label: `[HTTP:SERVER:${this.name}]` })

  // TCP sockets
  #sessions = new Set()

  constructor(router)
  {
    this.router = router
  }

  async bootstrap(settings)
  {
    Object.assign(this.log.config, settings?.log)

    const
      routes         = settings?.router?.routes ?? {},
      serverSettings = Object.assign({}, settings?.server)

    this.router.setRoutes(routes, settings?.router?.seperators)

    if(serverSettings.pfx
    || serverSettings.key
    || serverSettings.cert)
    {
      this.#bootstrapSecureServers(serverSettings)
    }
    else
    {
      this.#bootstrapNonSecureServers(serverSettings)
    }

    this.http2Server.on('session', this.addSession.bind(this))
    this.gateway.on('close', () => setImmediate(() => this.log.info`closed`))
    this.gateway.on('error', this.#onServerError.bind(this))
  }

  async listen(...args)
  {
    await new Promise((accept, reject) =>
    {
      if(this.gateway)
      {
        const
          acceptCb = () => { this.gateway.off('error',     rejectCb); accept() },
          rejectCb = () => { this.gateway.off('listening', acceptCb); reject() }

        this.gateway.once('error',     rejectCb)
        this.gateway.once('listening', acceptCb)

        this.gateway.listen(...args)
      }
      else
      {
        this.#onServerNotAvailible(reject)
      }
    })

    // Log the port the server is listening on.
    const { port } = this.gateway.address()
    this.log.info`port ${port} ⇡ listening`
  }

  async close()
  {
    // Close the gateway.
    await new Promise((accept, reject) =>
      this.gateway
      ? this.gateway.close((error) =>
          error
          ? reject(error)
          : setImmediate(accept))
      : this.#onServerNotAvailible(reject))

    // Close all sessions.
    for(const session of this.#sessions)
      await new Promise((accept) =>
        session.closed
        ? accept()
        : session.close(accept))
  }

  addSession(session)
  {
    if(false === session.closed)
    {
      session.id = this.#composeSessionId()

      session.on('close', () => this.log.info`${session.id} ⇣ closed`)
      session.on('close', () => this.#sessions.delete(session))
      session.on('error', (error) => this.log.fail`${error}`)
      this.#sessions.add(session)
      this.log.info`${session.id} ⇡ session`
    }
  }

  // RFC 7540, Section 3.5
  // The preface of a HTTP/2 request is designed to unambiguously signal 
  // that the client wants to use HTTP/2.
  static #_HTTP2_PREFACE_BUFFER = Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n')

  /**
   * @param {net.Socket|tls.Socket} socket 
   * @returns {Buffer}
   */
  async #readPreface(socket)
  {
    let preface

    do
    {
      if(socket.destroyed)
      {
        return Buffer.alloc(0)
      }

      if(preface = socket.read(HttpServer.#_HTTP2_PREFACE_BUFFER.length))
      {
        return preface
      }

      await new Promise((accept) => process.nextTick(accept))
    }
    while(null === preface)
  }

  #onGatewayConnection(onHttp1Socket, onHttp2Socket, socket)
  {
    socket.once('readable', async () => 
    {
      const preface = await this.#readPreface(socket)

      clearTimeout(timeout)
      socket.unshift(preface)

      preface.equals(HttpServer.#_HTTP2_PREFACE_BUFFER)
      ? onHttp2Socket(socket)
      : onHttp1Socket(socket)
    })

    const timeout = setTimeout(socket.destroy.bind(socket), 1e3)
  }

  #onGatewayConnectionHttp1Socket(socket)
  {
    this.http1Server.emit('connection', socket)
  }

  #onGatewayConnectionHttp2Socket(socket)
  {
    this.http2Server.emit('connection', socket)
  }

  #onGatewayConnectionSecureHttp1Socket(socket)
  {
    this.http1Server.emit('secureConnection', socket)
  }

  #onGatewayConnectionSecureHttp2Socket(socket)
  {
    // If possible to get this session some other way, then it should 
    // be concidered due to the version constraint.
    // Added in: v21.7.0, v20.12.0.
    const session = http2.performServerHandshake(socket)
    this.http2Server.emit('session', session)

    session.on('stream', (stream, headers) =>
    {
      const
        upstream    = new http2.Http2ServerRequest(stream, headers),
        downstream  = new http2.Http2ServerResponse(stream)

      this.http2Server.emit('request', upstream, downstream)
    })
  }

  #onHttp1Request(request, response)
  {
    if(undefined === request.socket.socketID)
    {
      request.socket.socketID     = this.#composeSessionId()
      request.socket.socketIndex  = 1
    }
    else
    {
      request.socket.socketIndex += 1
    }

    if('keep-alive' === request.headers.connection)
    {
      const timeout = Math.floor(this.http1Server.keepAliveTimeout / 1e3)
      response.setHeader('keep-alive', 'timeout=' + timeout)
      this.log.info`${request.socket.socketID} ⇡ keep-alive`
    }
  }

  #onServerRequest(protocol, upstream, downstream)
  {
    const requestID = this.#composeRequestId(upstream)

    this.log.info`${requestID} ⇡ request`

    const
      session     = {},
      request     = {},
      url         = new URL(upstream.url, `${protocol}://${upstream.headers.host}`),
      criteria    = url.pathname.replace(/\/+$/, ''), // removed trailing slashes
      body        = this.#bufferBody(upstream, request),
      abortion    = new AbortController

    Object.defineProperties(request, 
    {
      // configurable and writable criteria property
      criteria    : { writable:true, configurable:true, value:criteria },
      // configurable and writable stream data reader
      body        : { writable:true, configurable:true, value:body },
      // enumerable data readers, non-configurable 
      method      : { enumerable:true, value:upstream.method },
      headers     : { enumerable:true, value:upstream.headers },
      url         : { enumerable:true, value:url },
    })
    Object.defineProperties(session,
    {
      // non enumerable and non-configurable session properties
      downstream  : { value:downstream },
      upstream    : { value:upstream },
      abortion    : { value:abortion }
    })

    Object.defineProperty(session, 'view', { enumerable: true, value: new View(session) })

    abortion.signal.onabort = () => this.#onAbortedRequest(session)

    upstream.on('aborted', this.#onUpstreamAborted.bind(this, session))
    upstream.on('error',   this.#onUpstreamError.bind(this))

    downstream.on('error', this.#onDownstreamError.bind(this))
    downstream.on('close', this.#onStreamClosed.bind(this, session))
    downstream.on('close', () => this.log.info`${requestID} ⇣ closed ${session.view.status} ${request.method} ${url.pathname}`)

    this.dispatched++
    this.router.dispatch(request, session)
      .catch(this.#onRouterDispatchRejected.bind(this, session))
      .then(this.#onRouterDispatchCompleted.bind(this, session))
  }

  #bufferBody(upstream, request)
  {
    return new Promise((accept, reject) =>
    {
      if(upstream.readableEnded)
      {
        const error = new Error('The upstream is already closed')
        error.code  = 'E_HTTP_SERVER_READ_BUFFERED_UPSTREAM_CLOSED'
        reject(error)
      }
      else
      {
        const
          data      = [],
          pushChunk = (chunk) => data.push(chunk)

        upstream.on('error', reject)
        upstream.on('data', pushChunk)
        upstream.on('end', () => 
        {
          upstream.off('error', reject)
          upstream.off('data', pushChunk)

          request.body = Buffer.concat(data)

          accept(request.body)
        })
      }
    })
  }

  #composeIdSegment(index)
  {
    return index.toString(36).toUpperCase().padStart(4, '0')
  }

  #composeSessionId()
  {
    const
      timestamp = Date.now().toString(36),
      randomKey = Math.random().toString(36).slice(2, 6).padStart(4, '0')

    return `${timestamp}.${randomKey}`.toUpperCase()
  }

  // HTTP/2 streams have a unique ID, while HTTP/1.1 requests are identified by the socket.
  #composeRequestId(upstream)
  {
    if(upstream.stream)
    {
      const { id:streamID, session:{ id:sessionID } } = upstream.stream
      return sessionID + '.' + this.#composeIdSegment(streamID)
    }
    else
    {
      const { socketID, socketIndex } = upstream.socket
      return socketID + '.' + this.#composeIdSegment(socketIndex)
    }
  }

  #bootstrapSecureServers(serverSettings)
  {
    this.http1Server  = https.createServer(serverSettings)
    this.http2Server  = http2.createSecureServer(serverSettings)
    this.gateway      = tls.createServer(serverSettings)

    const 
      onHttp1Socket = this.#onGatewayConnectionSecureHttp1Socket.bind(this),
      onHttp2Socket = this.#onGatewayConnectionSecureHttp2Socket.bind(this)

    this.gateway.on('secureConnection', this.#onGatewayConnection.bind(this, onHttp1Socket, onHttp2Socket))
    this.http1Server.on('request', this.#onHttp1Request.bind(this))
    this.http1Server.on('request', this.#onServerRequest.bind(this, 'https'))
    this.http2Server.on('request', this.#onServerRequest.bind(this, 'https'))
  }

  #bootstrapNonSecureServers(serverSettings)
  {
    this.http1Server  = http.createServer(serverSettings)
    this.http2Server  = http2.createServer(serverSettings)
    this.gateway      = net.createServer(serverSettings)

    const
      onHttp1Socket = this.#onGatewayConnectionHttp1Socket.bind(this),
      onHttp2Socket = this.#onGatewayConnectionHttp2Socket.bind(this)

    this.gateway.on('connection', this.#onGatewayConnection.bind(this, onHttp1Socket, onHttp2Socket))
    this.http1Server.on('request', this.#onHttp1Request.bind(this))
    this.http1Server.on('request', this.#onServerRequest.bind(this, 'http'))
    this.http2Server.on('request', this.#onServerRequest.bind(this, 'http'))
  }

  #onServerNotAvailible(reject)
  {
    const error = new Error('Server not availible (requires a bootstrap process)')
    error.code  = 'E_HTTP_SERVER_NOT_AVAILIBLE'
    reject(error)
  }

  #onStreamClosed(session, reason)
  {
    const error = new Error('Stream closed')
    error.code  = 'E_HTTP_SERVER_STREAM_CLOSED'
    error.cause = reason

    session.abortion.abort(error)
  }

  #onUpstreamAborted(session)
  {
    const error = new Error('Upstream aborted')
    error.code  = 'E_HTTP_SERVER_UPSTREAM_ABORTED'
    session.abortion.abort(error)
  }

  #onRouterDispatchCompleted(session)
  {
    this.completed++
    session.view.present()
  }

  #onAbortedRequest(session)
  {
    this.abortions++
    session.abortion.signal.reason instanceof Error
    ? session.view.presentError(session.abortion.signal.reason)
    : session.view.present()
  }

  #onRouterDispatchRejected(session, reason)
  {
    this.rejections++
    session.view.presentError(reason.cause)
    this.log.fail`${reason}`
  }

  #onDownstreamError(reason)
  {
    const error = new Error('Downstream error')
    error.code  = 'E_HTTP_SERVER_DOWNSTREAM_ERROR'
    error.cause = reason
    this.log.fail`${error}`
  }

  #onUpstreamError(reason)
  {
    const error = new Error('Upstream error')
    error.code  = 'E_HTTP_SERVER_UPSTREAM_ERROR'
    error.cause = reason
    this.log.fail`${error}`
  }

  #onServerError(reason)
  {
    const error = new Error('Server error')
    error.code  = 'E_HTTP_SERVER_ERROR'
    error.cause = reason
    this.log.fail`${error}`
  }
}