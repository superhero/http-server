
# HTTP-server

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
const server = HttpServer(route);

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

You can override the default logging methods to integrate with your logging system.

#### Turn Off Info Logs

```javascript
server.log.info = () => null;
```

#### Custom Error Logging

```javascript
server.log.error = (error) => {
  // TODO: custom error logging logic...
};
```

#### Turn Off Log Colors

By default, the logger renders a colored output.

```javascript
server.log.format = server.log.simple;
```

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
    ✔ Can instantiate HttpServer (8.419758ms)
    ✔ Can bootstrap server with non-secure settings (2.635146ms)
    ✔ Listens and closes the server as expected (3.349393ms)
    ✔ Rejects if server is not available to listen error (2.108227ms)
    ✔ Rejects if server is not available to close error (1.792574ms)
  ✔ Lifecycle (19.74534ms)

  ▶ Routing and Requests
    ▶ HTTP/1
      ✔ Can dispatch a request aligned to the route map (39.125646ms)
      ✔ Can alter the output body (5.52864ms)
      ✔ Can stream HTML5 standard Server-Sent Events (SSE) (7.515151ms)
      ✔ Can alter the output headers (6.829782ms)
      ✔ Can alter the output status (5.509801ms)
      ✔ Can abort the dispatcher (6.059604ms)
      ✔ Can describe an abortion in detail (6.212658ms)
      ✔ Can manage thrown errors in the dispatcher (6.902106ms)
      ✔ Can not mistakenly access the wrong view property (4.354173ms)
      ✔ Can not mistakenly assign a value to the wrong view property (7.322497ms)
      ✔ Support connection keep-alive header (6.339005ms)
    ✔ HTTP/1 (103.550623ms)

    ▶ HTTP/2
      ✔ Can dispatch a request aligned to the route map (67.303149ms)
      ✔ Can alter the output body (6.051175ms)
      ✔ Can stream HTML5 standard Server-Sent Events (SSE) (5.646976ms)
      ✔ Can alter the output headers (4.816813ms)
      ✔ Can alter the output status (8.330617ms)
      ✔ Can abort the dispatcher (6.803324ms)
      ✔ Can describe an abortion in detail (4.771987ms)
      ✔ Can manage thrown errors in the dispatcher (6.57489ms)
      ✔ Can not mistakenly access the wrong view property (4.451118ms)
      ✔ Can not mistakenly assign a value to the wrong view property (4.587527ms)
    ✔ HTTP/2 (120.216844ms)
  ✔ Routing and Requests (224.037442ms)

  ▶ HTTPS server with self-signed certificate
    ▶ TLSv1.2
      ▶ RSA:2048
        ✔ HTTP1 (9.766994ms)
        ✔ HTTP2 (10.784857ms)
      ✔ RSA:2048 (157.12133ms)

      ▶ RSA:4096
        ✔ HTTP1 (11.566225ms)
        ✔ HTTP2 (18.136774ms)
      ✔ RSA:4096 (581.128109ms)

      ▶ ECDSA:P-256
        ✔ HTTP1 (5.324231ms)
        ✔ HTTP2 (8.312658ms)
      ✔ ECDSA:P-256 (50.979123ms)

      ▶ ECDSA:P-384
        ✔ HTTP1 (6.277003ms)
        ✔ HTTP2 (9.918662ms)
      ✔ ECDSA:P-384 (52.076847ms)

      ▶ ECDSA:P-521
        ✔ HTTP1 (10.988173ms)
        ✔ HTTP2 (13.745049ms)
      ✔ ECDSA:P-521 (63.762337ms)

      ▶ EdDSA:Ed25519
        ✔ HTTP1 (4.940083ms)
        ✔ HTTP2 (8.791915ms)
      ✔ EdDSA:Ed25519 (48.717009ms)

      ▶ EdDSA:Ed448
        ✔ HTTP1 (6.589414ms)
        ✔ HTTP2 (8.132894ms)
      ✔ EdDSA:Ed448 (50.727502ms)
    ✔ TLSv1.2 (1005.148618ms)

    ▶ TLSv1.3
      ▶ RSA:2048
        ✔ HTTP1 (6.038652ms)
        ✔ HTTP2 (8.748363ms)
      ✔ RSA:2048 (119.601474ms)

      ▶ RSA:4096
        ✔ HTTP1 (12.785668ms)
        ✔ HTTP2 (14.531181ms)
      ✔ RSA:4096 (622.520543ms)

      ▶ ECDSA:P-256
        ✔ HTTP1 (6.356325ms)
        ✔ HTTP2 (10.260146ms)
      ✔ ECDSA:P-256 (59.91212ms)

      ▶ ECDSA:P-384
        ✔ HTTP1 (8.192784ms)
        ✔ HTTP2 (16.138147ms)
      ✔ ECDSA:P-384 (66.214344ms)

      ▶ ECDSA:P-521
        ✔ HTTP1 (9.829523ms)
        ✔ HTTP2 (14.905145ms)
      ✔ ECDSA:P-521 (71.622241ms)

      ▶ EdDSA:Ed25519
        ✔ HTTP1 (6.453652ms)
        ✔ HTTP2 (6.992268ms)
      ✔ EdDSA:Ed25519 (50.780468ms)

      ▶ EdDSA:Ed448
        ✔ HTTP1 (5.421677ms)
        ✔ HTTP2 (7.588945ms)
      ✔ EdDSA:Ed448 (49.520972ms)
    ✔ TLSv1.3 (1040.826701ms)
  ✔ HTTPS server with self-signed certificate (2046.10023ms)
✔ @superhero/http-server (2290.563163ms)

tests 68
suites 8
pass 68

--------------------------------------------------------------------------------------------------------------
file            | line % | branch % | funcs % | uncovered lines
--------------------------------------------------------------------------------------------------------------
index.js        |  91.75 |    91.18 |   74.07 | 92-94 128-129 135-137 266-269 369-373 389-394 397-402 405-410
index.test.js   | 100.00 |   100.00 |  100.00 | 
view.js         |  92.98 |    88.89 |   84.21 | 133-138 196-200 238-239 247-253
--------------------------------------------------------------------------------------------------------------
all files       |  95.31 |    93.68 |   86.61 | 
--------------------------------------------------------------------------------------------------------------
```

## License

This project is licensed under the MIT License.

## Contributing

Feel free to submit issues or pull requests for improvements or additional features.
