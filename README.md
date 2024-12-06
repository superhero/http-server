
# HTTP-Server

An HTTP server module for Node.js that supports both HTTP/1.1 and HTTP/2 protocols, with built-in routing, HTTPS support, and stream support that defaults to server-sent events (SSE). Designed to be robust, flexible and extendible, while easy to work with.

## Table of Contents

- [Installation](#installation)
- [Getting Started](#getting-started)
- [Usage](#usage)
  - [Basic Example](#basic-example)
  - [HTTPS Setup with Self-Signed Certificate](#https-setup-with-self-signed-certificate)
  - [Altering Response Body, Headers, and Status](#altering-response-body-headers-and-status)
  - [Handling Aborted Requests](#handling-aborted-requests)
  - [Streaming Server-Sent Events (SSE)](#streaming-server-sent-events-sse)
  - [Custom Logging](#custom-logging)
- [API](#api)
  - [`HttpServer`](#httpserver)
  - [`session.view`](#sessionview)
  - [`session.abortion`](#sessionabortion)
- [Testing](#testing)
- [Coverage Report](#coverage-report)
- [Contributing](#contributing)
- [License](#license)

## Installation

Install the package using npm:

```bash
npm install @superhero/http-server
```

## Getting Started

The `@superhero/http-server` module integrates with the `@superhero/locator` and `@superhero/router` modules to provide a flexible and modular HTTP server.

To get started, you'll need to set up a `Locator` instance, register your dispatchers, and then locate the `HttpServer` module using the `locator`.

## Usage

### Basic Example

```javascript
import HttpServer from '@superhero/http-server';
import Locator    from '@superhero/locator';
import Router     from '@superhero/router';

// Instantiate the service locator
const locator = new Locator();

// Instantiate the router
const router = new Router(locator);

// Instantiate the server
const server = new HttpServer(router);

// Register the route dispatcher service
locator.set('hello-dispatcher', {
  dispatch: (request, session) => {
    session.view.body.message = 'Hello, World!';
  },
});

// Routes
const settings = {
  router: {
    routes: {
      hello: {
        criteria: '/hello',
        dispatcher: 'hello-dispatcher',
      },
    },
  },
};

// Bootstrap and start the server
await server.bootstrap(settings);
await server.listen(3000);
```

**Explanation:**

- **Import Statements**: We instantiate the required components `locator`, `router` and `server`.
- **Dispatcher Registration**: Register a dispatcher called `'hello-dispatcher'` in the locator.
- **Server Settings**: Define the routes, and possible other server configurations, in the `settings` object.
- **Bootstrap and Listen**: Bootstrap the server with the settings and start listening on port `3000`.
- **Ready to serve requests**: Request to `http://localhost:3000/hello` will reply `{ "message": "Hello, World!" }`.

### HTTPS Setup with Self-Signed Certificate

```javascript
import fs       from 'node:fs';
import Locator  from '@superhero/locator';

// Instantiate the service locator
const locator = new Locator();

// Locate the server
const server = await locator.lazyload('@superhero/http-server');

// Register necessary services
locator.set('secure-dispatcher', {
  dispatch: (request, session) => {
    session.view.body = { message: 'Secure Hello, World!' };
  },
});

// Server settings and routes
const serverSettings = {
  server: {
    key: fs.readFileSync('path/to/private.key'),
    cert: fs.readFileSync('path/to/server.cert'),
  },
  router: {
    routes: {
      secure: {
        criteria: '/secure',
        dispatcher: 'secure-dispatcher',
      },
    },
  },
};

await server.bootstrap(serverSettings);
await server.listen(443);
```

> [!NOTE]
> Replace `'path/to/private.key'` and `'path/to/server.cert'` with the actual paths to your SSL key and certificate files.

### Altering Response Body, Headers, and Status

```javascript
locator.set('custom-dispatcher', {
  dispatch: (request, session) => {
    session.view.body = { data: 'Custom Data' };
    session.view.headers['Custom-Header'] = 'CustomValue';
    session.view.status = 201; // HTTP 201 Created
  },
});

// Update the routes in the settings
const settings = {
  router: {
    routes: {
      custom: {
        criteria: '/custom',
        dispatcher: 'custom-dispatcher',
      },
    },
  },
};

// Bootstrap and start the server
await server.bootstrap(settings);
await server.listen(3000);
```

### Handling Aborted Requests

```javascript
locator.set('abort-dispatcher', {
  dispatch: (request, session) => {
    // Abort the request with a custom error
    const error = new Error('Request Aborted');
    error.code = 'E_REQUEST_ABORTED';
    session.abortion.abort(error);
  },
});

// Update the routes in the settings
const settings = {
  router: {
    routes: {
      abort: {
        criteria: '/abort',
        dispatcher: 'abort-dispatcher',
      },
    },
  },
};

// Bootstrap and start the server
await server.bootstrap(settings);
await server.listen(3000);
```

> [!NOTE]
> Will result in a `status 500` response `{ "error": "Request Aborted", "code": "E_REQUEST_ABORTED" }`

### Streaming Server-Sent Events (SSE)

```javascript
locator.set('sse-dispatcher', {
  dispatch: (request, session) => {
    // Write events to the stream
    session.view.stream.write({ data: 'First message' });
    session.view.stream.write({ data: 'Second message' });

    // End the stream
    session.view.stream.end();
  },
});

// Update the routes in the settings
const settings = {
  router: {
    routes: {
      sse: {
        criteria: '/sse',
        dispatcher: 'sse-dispatcher',
      },
    },
  },
};

// Bootstrap and start the server
await server.bootstrap(settings);
await server.listen(3000);
```

> [!NOTE]
> By default responds with a `text/event-stream` content type:
> ```
> data: { "data": "First message" }
>
> data: { "data": "Second message" }
> ```

### Custom Logging

You can override, or hook into, the default logging method to integrate reactions with your logging requirements.

#### Turn of logs

```
server.log.config.mute = true
```

#### Learn more

Read the github page for the repository this component depend on for logging: [@superhero/log](https://github.com/superhero/log).


## API

### `HttpServer`

The main class responsible for handling HTTP requests.

- **Constructor**: The server can be instantiated or located via the `Locator`.
  - Use `locator.locate('@superhero/http-server')` to get an instance.

- **Methods**:
  - `async bootstrap(settings)`: Bootstraps the server with the provided settings.
    - `settings`: An object containing server and router configurations.
  - `async listen(port)`: Starts the server on the specified port.
    - `port`: The port number to listen on.
  - `async close()`: Closes the server and all active sessions.

### `request`

An object used to read 

- **Properties**:
  - `body`: The request body (Promise).
  - `method`: The request HTTP method.
  - `headers`: The request HTTP headers.
  - `url`: The requested URL.

### `session.view`

An object used within dispatchers to manipulate the response.

- **Properties**:
  - `body`: The response body to be sent to the client.
  - `headers`: An object containing response headers.
  - `status`: HTTP status code of the response.
  - `stream`: A writable stream for sending SSE data, or to be configured to stream some other type of response to the client.

### `session.abortion`

An `AbortController` used to trigger and manage dispatch abortion.

- **Methods**:
  - `abort(error)`: Aborts the request with the provided error.

## Testing

The test suite uses Node.js's built-in testing module.

### Running Tests

To run the tests, execute:

```bash
npm test
```

### Test Coverage

```
▶ @superhero/http-server
  ▶ Lifecycle
    ✔ Can instantiate HttpServer (8.609311ms)
    ✔ Can bootstrap server with non-secure settings (2.813603ms)
    ✔ Can be configured by the configuration file (37.159723ms)
    ✔ Listens and closes the server as expected (5.81708ms)
    ✔ Rejects if server is not available to listen error (2.290967ms)
    ✔ Rejects if server is not available to close error (1.058432ms)
  ✔ Lifecycle (59.459503ms)
  
  ▶ Routing and Requests
    ▶ HTTP/1
      ✔ Can dispatch a request aligned to the route map (42.67787ms)
      ✔ Can alter the output body (5.709405ms)
      ✔ Can stream HTML5 standard Server-Sent Events (SSE) (9.72838ms)
      ✔ Can alter the output headers (9.330729ms)
      ✔ Can alter the output status (7.159825ms)
      ✔ Can abort the dispatcher (5.969359ms)
      ✔ Can describe an abortion in detail (7.225311ms)
      ✔ Can manage thrown errors in the dispatcher (10.332202ms)
      ✔ Can not mistakenly access the wrong view property (7.490531ms)
      ✔ Can not mistakenly assign a value to the wrong view property (5.522195ms)
      ✔ Support connection keep-alive header (10.362687ms)
    ✔ HTTP/1 (122.952777ms)

    ▶ HTTP/2
      ✔ Can dispatch a request aligned to the route map (24.833859ms)
      ✔ Can alter the output body (8.516916ms)
      ✔ Can stream HTML5 standard Server-Sent Events (SSE) (10.336142ms)
      ✔ Can alter the output headers (8.209538ms)
      ✔ Can alter the output status (7.35682ms)
      ✔ Can abort the dispatcher (8.554265ms)
      ✔ Can describe an abortion in detail (5.330231ms)
      ✔ Can manage thrown errors in the dispatcher (9.391412ms)
      ✔ Can not mistakenly access the wrong view property (7.222525ms)
      ✔ Can not mistakenly assign a value to the wrong view property (8.57349ms)
    ✔ HTTP/2 (99.758519ms)
  ✔ Routing and Requests (222.916463ms)

  ▶ HTTPS server with self-signed certificate
    ▶ TLSv1.2
      ▶ RSA:2048
        ✔ HTTP1 (10.68221ms)
        ✔ HTTP2 (14.607846ms)
      ✔ RSA:2048 (184.393685ms)

      ▶ RSA:4096
        ✔ HTTP1 (11.166249ms)
        ✔ HTTP2 (14.376707ms)
      ✔ RSA:4096 (239.998059ms)

      ▶ ECDSA:P-256
        ✔ HTTP1 (6.998372ms)
        ✔ HTTP2 (9.255564ms)
      ✔ ECDSA:P-256 (52.737888ms)

      ▶ ECDSA:P-384
        ✔ HTTP1 (8.610887ms)
        ✔ HTTP2 (9.7637ms)
      ✔ ECDSA:P-384 (52.826908ms)

      ▶ ECDSA:P-521
        ✔ HTTP1 (9.391868ms)
        ✔ HTTP2 (13.179682ms)
      ✔ ECDSA:P-521 (62.741409ms)

      ▶ EdDSA:Ed25519
        ✔ HTTP1 (10.110816ms)
        ✔ HTTP2 (9.99596ms)
      ✔ EdDSA:Ed25519 (58.01589ms)

      ▶ EdDSA:Ed448
        ✔ HTTP1 (4.651357ms)
        ✔ HTTP2 (10.031462ms)
      ✔ EdDSA:Ed448 (51.550013ms)
    ✔ TLSv1.2 (703.01496ms)

    ▶ TLSv1.3
      ▶ RSA:2048
        ✔ HTTP1 (6.43647ms)
        ✔ HTTP2 (9.551209ms)
      ✔ RSA:2048 (113.791235ms)

      ▶ RSA:4096
        ✔ HTTP1 (18.396852ms)
        ✔ HTTP2 (22.414178ms)
      ✔ RSA:4096 (819.288505ms)

      ▶ ECDSA:P-256
        ✔ HTTP1 (7.036644ms)
        ✔ HTTP2 (11.842337ms)
      ✔ ECDSA:P-256 (100.196088ms)

      ▶ ECDSA:P-384
        ✔ HTTP1 (8.183114ms)
        ✔ HTTP2 (12.428711ms)
      ✔ ECDSA:P-384 (61.367513ms)

      ▶ ECDSA:P-521
        ✔ HTTP1 (12.446168ms)
        ✔ HTTP2 (15.564381ms)
      ✔ ECDSA:P-521 (68.39823ms)

      ▶ EdDSA:Ed25519
        ✔ HTTP1 (4.44369ms)
        ✔ HTTP2 (11.703458ms)
      ✔ EdDSA:Ed25519 (54.613453ms)

      ▶ EdDSA:Ed448
        ✔ HTTP1 (13.499592ms)
        ✔ HTTP2 (11.474115ms)
      ✔ EdDSA:Ed448 (68.423656ms)
    ✔ TLSv1.3 (1287.220809ms)
  ✔ HTTPS server with self-signed certificate (1990.42993ms)
✔ @superhero/http-server (2273.646154ms)

tests 69
suites 8
pass 69

---------------------------------------------------------------------------------------------------------------------
file                   | line % | branch % | funcs % | uncovered lines
---------------------------------------------------------------------------------------------------------------------
index.js               |  91.75 |    91.18 |   74.07 | 92-94 128-129 135-137 266-269 369-373 389-394 397-402 405-410
index.test.js          | 100.00 |   100.00 |  100.00 | 
middleware             |        |          |         | 
 upstream              |        |          |         | 
  header               |        |          |         | 
   accept.js           |  19.23 |   100.00 |   33.33 | 10-51
   content-type.js     |  20.00 |   100.00 |   50.00 | 9-44
   content-type        |        |          |         | 
    application        |        |          |         | 
     json.js           |  31.03 |   100.00 |    0.00 | 9-28
  method.js            |  23.68 |   100.00 |   50.00 | 9-37
view.js                |  92.98 |    88.89 |   84.21 | 133-138 196-200 238-239 247-253
---------------------------------------------------------------------------------------------------------------------
all files              |  86.57 |    93.96 |   83.82 | 
---------------------------------------------------------------------------------------------------------------------
```

## License

This project is licensed under the MIT License.

## Contributing

Feel free to submit issues or pull requests for improvements or additional features.
