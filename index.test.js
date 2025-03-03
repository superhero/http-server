import assert       from 'node:assert'
import path         from 'node:path'
import util         from 'node:util'
import fs           from 'node:fs'
import https        from 'node:https'
import tls          from 'node:tls'
import Config       from '@superhero/config'
import Request      from '@superhero/http-request'
import Router       from '@superhero/router'
import Locator      from '@superhero/locator'
import HttpServer   from '@superhero/http-server'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, suite, test } from 'node:test'

util.inspect.defaultOptions.depth = 5

suite('@superhero/http-server', () => 
{
  let locator, server

  beforeEach(async () => 
  {
    if(beforeEach.skip) 
    {
      return
    }

    locator = new Locator()

    await locator.eagerload(
    {
      '@superhero/http-server': path.resolve('./index.js') 
    })

    server = locator.locate('@superhero/http-server')
    server.log.config.mute = true
  })

  afterEach (() => 
  {
    if(afterEach.skip) 
    {
      return
    }
    locator.clear()
  })

  suite('Lifecycle', async () => 
  {
    test('Can instantiate HttpServer', () => 
    {
      const router = new Router(locator)
      assert.doesNotThrow(() => new HttpServer(router))
    })

    test('Can bootstrap server with non-secure settings', async () => 
    {
      await server.bootstrap()

      assert.ok(server.http1Server)
      assert.ok(server.http1Server.constructor.name === 'Server')

      assert.ok(server.http2Server)
      assert.ok(server.http2Server.constructor.name === 'Http2Server')
    })

    test('Can be configured by the configuration file', async () =>
    {
      const config = new Config()
      const { filepath, config: resolved } = await config.resolve('./config.json')
      config.add(filepath, resolved)

      assert.ok(config.find('bootstrap'))
      assert.ok(config.find('locator'))
      assert.ok(config.find('http-server/server'))
      assert.ok(config.find('http-server/router/routes'))

      await locator.eagerload(config.find('locator'))

      assert.ok(locator.has('@superhero/http-server'))
      assert.ok(locator.has('@superhero/http-server/dispatcher/upstream/method'))
      assert.ok(locator.has('@superhero/http-server/dispatcher/upstream/header/accept'))
      assert.ok(locator.has('@superhero/http-server/dispatcher/upstream/header/content-type'))
      assert.ok(locator.has('@superhero/http-server/dispatcher/upstream/header/content-type/application/json'))
    })

    test('Listens and closes the server as expected', async () => 
    {
      await server.bootstrap()
      await assert.doesNotReject(server.listen())
      await assert.doesNotReject(server.close())
    })

    test('Rejects if server is not available to listen error', async () => 
    {
      await assert.rejects(
        server.listen(),
        (error) => error.code === 'E_HTTP_SERVER_NOT_AVAILIBLE')
    })

    test('Rejects if server is not available to close error', async () => 
    {
      await assert.rejects(
        server.close(),
        (error) => error.code === 'E_HTTP_SERVER_NOT_AVAILIBLE')
    })
  })

  suite('Routing and Requests', async () => 
  {
    let request

    beforeEach(async () =>
    {
      await server.bootstrap()
      await server.listen()
      const { port } = server.gateway.address()
      request = new Request(
      {
        base: `http://localhost:${port}`, 
        timeout: 1e3, 
        doNotThrowOnErrorStatus: true
      })
    })

    afterEach(async () =>
    {
      await server.close()
    })

    suite('HTTP/1', () => 
    {
      beforeEach(() => request.config.headers = { 'connection': 'close' })
      sameTestsForBothProtocols()

      test('Support connection keep-alive header', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher'
            }})

        locator.set('foo-dispatcher', { dispatch: () => null })

        // Set the keep-alive timeout to 10 seconds on the server.
        const keepAlive = 10
        server.http1Server.keepAliveTimeout = keepAlive * 1e3

        // Make a request with the connection header set to keep-alive.
        const response1 = await request.get({ url: `/test/foo`, headers: { 'connection': 'keep-alive' }})
        assert.equal(response1.status, 200, 'Should have received a 200 status')
        assert.equal(response1.headers['connection'], 'keep-alive', 'Should echo the connection header')
        assert.equal(response1.headers['keep-alive'], 'timeout=' + keepAlive, 'Should have a keep-alive header')

        // Make a request with the connection header set to close.
        const response2 = await request.get({ url: `/test/foo`, headers: { 'connection': 'close' }})
        assert.equal(response2.status, 200, 'Should have received a 200 status')
        assert.equal(response2.headers['connection'], 'close', 'Should echo the connection header')
        assert.equal(response2.headers['keep-alive'], undefined, 'Should not have the keep-alive header')
      })
    })

    suite('HTTP/2', () =>
    {
      beforeEach(() => request.connect())
      afterEach(() => request.close())
      sameTestsForBothProtocols()
    })

    function sameTestsForBothProtocols()
    {
      test('Can dispatch a request aligned to the route map', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher'
            },
            'bar':
            { criteria   : '/test/bar',
              dispatcher : 'bar-dispatcher' }})

        let dispatched
        locator.set('foo-dispatcher', { dispatch: () => dispatched = 'foo' })
        locator.set('bar-dispatcher', { dispatch: () => dispatched = 'bar' })

        const fooResponse = await request.get(`/test/foo`)

        assert.equal(fooResponse.status, 200, 'Should have received a 200 status')
        assert.equal(dispatched, 'foo', 'Should have dispatched the foo route')

        const barResponse = await request.get(`/test/bar`)
        assert.equal(barResponse.status, 200, 'Should have received a 200 status for the bar request')
        assert.equal(dispatched, 'bar', 'Should have dispatched the bar route')
      })

      test('Can alter the output body', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher' }})

        locator.set('foo-dispatcher', 
          { dispatch: (_, session) => session.view.body.foo = 'bar' })

        const response = await request.get(`/test/foo`)
        assert.equal(response.status, 200, 'Should have received a 200 status')
        assert.equal(response.body.foo, 'bar', 'Response body should have been altered')
      })

      test('Can stream HTML5 standard Server-Sent Events (SSE)', async () => 
      {
        server.router.setRoutes(
          { 'sse':
            { criteria   : '/test/sse',
              dispatcher : 'sse-dispatcher' }})

        locator.set('sse-dispatcher', 
          { dispatch: (_, session) => 
            {
              session.view.stream.write({ foo: 'bar' })
              session.view.stream.write({ bar: 'baz' })
              session.view.stream.write({ baz: 'qux' })
              session.view.stream.end()
            }})

        const response = await request.get(`/test/sse`)

        assert.equal(response.status, 200, 'Should have received a 200 status')
        assert.equal(response.body.length, 3, 'Response body should have three records')
        assert.equal(response.body[0]?.data?.foo, 'bar', 'Response body should have the first record')
        assert.equal(response.body[1]?.data?.bar, 'baz', 'Response body should have the second record')
        assert.equal(response.body[2]?.data?.baz, 'qux', 'Response body should have the third record')
      })

      test('Can alter the output headers', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher' }})

        locator.set('foo-dispatcher', 
          { dispatch: (_, session) => session.view.headers.foo = 'bar' })

        const response = await request.get(`/test/foo`)
        assert.equal(response.status, 200, 'Should have received a 200 status')
        assert.equal(response.headers.foo, 'bar', 'Response header should have been altered')
      })

      test('Can alter the output status', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher' }})

        locator.set('foo-dispatcher', 
          { dispatch: (_, session) => session.view.status = 204 })

        const response = await request.get(`/test/foo`)
        assert.equal(response.status, 204, 'Should have received a 204 status')
      })

      test('Can abort the dispatcher', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher' }})

        locator.set('foo-dispatcher', 
          { dispatch: (_, session) => session.abortion.abort(new Error('Aborted')) })

        const response = await request.get(`/test/foo`)

        assert.equal(response.status, 500, 'Should have failed with a 500 status')
        assert.equal(response.body.error, 'Aborted', 'Response body should have the abortion message')
      })

      test('Can describe an abortion in detail', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher' }})

        locator.set('foo-dispatcher', 
        {
          dispatch: (_, session) => 
          {
            const error       = new Error('Aborted')
            error.code        = 'E_TEST_ABORT'
            error.cause       = new Error('Abortion test')
            error.cause.code  = 'E_TEST_ABORT_CAUSE'
            error.cause.cause = 'Deeper detailed test'
            session.abortion.abort(error) 
          }
        })

        const response = await request.get(`/test/foo`)

        assert.equal(response.status, 500, 'Should have failed with a 500 status')
        assert.equal(response.body.error, 'Aborted', 'Response body should have the abortion message')
        assert.equal(response.body.code, 'E_TEST_ABORT', 'Response body should have the abortion code')
        assert.equal(response.body.details?.[0], 'E_TEST_ABORT_CAUSE - Abortion test', 'Response body should have the abortion cause')
        assert.equal(response.body.details?.[1], 'Deeper detailed test', 'Response body should have the deeper detailed error message')
      })

      test('Can manage thrown errors in the dispatcher', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher' }})

        locator.set('foo-dispatcher', 
        { 
          dispatch: () => 
          {
            const error = new Error('Failed dispatcher test')
            error.code  = 'E_TEST_FAILED_DISPATCHER'
            throw error
          }
        })

        let errorLoggerCalled = false

        server.log.on('fail', (_, error) => 
        {
          errorLoggerCalled = true
          assert.equal(error.code,        'E_ROUTER_DISPATCH_FAILED', 'Should throw router error')
          assert.equal(error.cause.code,  'E_TEST_FAILED_DISPATCHER', 'The error should have the dispatcher error as cause')
        })

        const response = await request.get(`/test/foo`)

        assert.equal(response.status,     500,                        'Should have failed with a 500 status')
        assert.equal(response.body.error, 'Failed dispatcher test',   'Response body should have the error message')
        assert.equal(response.body.code,  'E_TEST_FAILED_DISPATCHER', 'Response body should have the error code')
        assert.equal(errorLoggerCalled,   true,                       'The error logger should have been called')
      })

      test('Can not mistakenly access the wrong view property', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher' }})

        locator.set('foo-dispatcher',
          { dispatch: (_, session) => session.view.invalidAttribute })

        let errorLoggerCalled = false

        server.log.on('fail', (_, error) => 
        {
          errorLoggerCalled = true
          assert.equal(error.code,        'E_ROUTER_DISPATCH_FAILED')
          assert.equal(error.cause.code,  'E_HTTP_SERVER_VIEW_MODEL_PROPERTY_NOT_READABLE')
        })

        const response = await request.get(`/test/foo`)

        assert.equal(response.status, 500, 'Should have failed with a 500 status')
        assert.equal(response.body.code, 'E_HTTP_SERVER_VIEW_MODEL_PROPERTY_NOT_READABLE')
        assert.equal(errorLoggerCalled, true)
      })

      test('Can not mistakenly assign a value to the wrong view property', async () => 
      {
        server.router.setRoutes(
          { 'foo':
            { criteria   : '/test/foo',
              dispatcher : 'foo-dispatcher' }})

        locator.set('foo-dispatcher',
          { dispatch: (_, session) => session.view.invalidAttribute = 'This should not be possible' })

        
        let errorLoggerCalled = false

        server.log.on('fail', (_, error) => 
        {
          errorLoggerCalled = true
          assert.equal(error.code,        'E_ROUTER_DISPATCH_FAILED')
          assert.equal(error.cause.code,  'E_HTTP_SERVER_VIEW_MODEL_PROPERTY_NOT_WRITABLE')
        })

        const response = await request.get(`/test/foo`)

        assert.equal(response.status, 500, 'Should have failed with a 500 status')
        assert.equal(response.body.code, 'E_HTTP_SERVER_VIEW_MODEL_PROPERTY_NOT_WRITABLE')
        assert.equal(errorLoggerCalled, true)
      })
    }
  })

  suite('HTTPS server with self-signed certificate', async () =>
  {
    const 
      tlsVersions = ['TLSv1.2', 'TLSv1.3'],
      algorithms  =
      {
        'RSA:2048'      : `openssl req -newkey rsa:2048 -nodes -keyout test/private.key -x509 -days 365 -out test/server.cert -subj "/CN=localhost"`,
        'RSA:4096'      : `openssl req -newkey rsa:4096 -nodes -keyout test/private.key -x509 -days 365 -out test/server.cert -subj "/CN=localhost"`,
        'ECDSA:P-256'   : `openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout test/private.key -x509 -days 365 -out test/server.cert -subj "/CN=localhost"`,
        'ECDSA:P-384'   : `openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-384 -nodes -keyout test/private.key -x509 -days 365 -out test/server.cert -subj "/CN=localhost"`,
        'ECDSA:P-521'   : `openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-521 -nodes -keyout test/private.key -x509 -days 365 -out test/server.cert -subj "/CN=localhost"`,
        'EdDSA:Ed25519' : `openssl req -newkey ed25519 -nodes -keyout test/private.key -x509 -days 365 -out test/server.cert -subj "/CN=localhost"`,
        'EdDSA:Ed448'   : `openssl req -newkey ed448 -nodes -keyout test/private.key -x509 -days 365 -out test/server.cert -subj "/CN=localhost"`,
      }

    for(const tlsVersion of tlsVersions)
    {
      suite(tlsVersion, () =>
      {
        for(const algorithm in algorithms)
        {
          test(algorithm, async (sub) =>
          {
            fs.mkdirSync('test', { recursive: true })
            execSync(algorithms[algorithm], { stdio: ['ignore', 'ignore', 'pipe'] })

            const
              cert = fs.readFileSync('test/server.cert').toString(),
              key  = fs.readFileSync('test/private.key').toString()

            fs.rmSync('test', { recursive: true, force: true })

            await assert.doesNotReject(server.bootstrap(
              { server: { cert, key, minVersion: tlsVersion, maxVersion: tlsVersion }, 
                router:
                { routes:
                  { 'test':
                    { criteria   : '/test',
                      dispatcher : 'test-dispatcher' }}}}))

            locator.set('test-dispatcher', 
              { dispatch: (_, session) => session.view.body.dispatched = true })

            assert.ok(server.gateway      instanceof tls.Server)
            assert.ok(server.http1Server  instanceof https.Server)
            assert.ok(server.http2Server?.constructor.name === 'Http2SecureServer')

            await assert.doesNotReject(server.listen())

            const { port } = server.gateway.address()
            const request = new Request({ base: `https://localhost:${port}`, timeout: 5e3, rejectUnauthorized: false })

            beforeEach.skip = true
            afterEach.skip  = true

            await sub.test('HTTP1', async () =>
            {
              const http1Response = await request.get({ url:'/test', headers: { 'connection': 'close' }})
              assert.equal(http1Response.status, 200, 'Should have received a 200 status')
              assert.equal(http1Response.body.dispatched, true, 'Should have dispatched the test route')
            })

            await sub.test('HTTP2', async () =>
            {
              await request.connect()
              const http2Response1 = await request.get('/test')
              const http2Response2 = await request.get('/test')
              await request.close()
  
              assert.equal(http2Response1.status, 200, 'HTTP2 request 1 should have received a 200 status')
              assert.equal(http2Response2.status, 200, 'HTTP2 request 2 should have received a 200 status')
              assert.equal(http2Response1.body.dispatched, true, 'HTTP2 request 1 should have dispatched the test route')
              assert.equal(http2Response2.body.dispatched, true, 'HTTP2 request 2 should have dispatched the test route')
            })

            delete beforeEach.skip
            delete afterEach.skip

            await assert.doesNotReject(server.close())
          })
        }
      })
    }
  })
})