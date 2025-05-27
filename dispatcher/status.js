import os from 'os'

export function locate(locator)
{
  const server = locator.locate('@superhero/http-server')
  return new StatusDispatcher(server)
}

export default class StatusDispatcher
{
  started       = new Date()
  started_json  = this.started.toJSON().substring(0, 19).replace('T', ' ') + 'Z'

  constructor(server)
  {
    this.server = server
  }

  dispatch(request, session)
  {
    session.view.body.name    = this.server.name
    session.view.body.started = this.started_json

    // Statistics
    if(request.url.searchParams.get('stats'))
    {
      session.view.body.dispatched = String(this.server.dispatched)
      session.view.body.completed  = String(this.server.completed)
      session.view.body.abortions  = String(this.server.abortions)
      session.view.body.rejections = String(this.server.rejections)
    }

    // Uptime
    if(request.url.searchParams.get('uptime'))
    {
      session.view.body.uptime = String(this.started.getTime() - new Date().getTime())
    }

    // CPU usage
    if(request.url.searchParams.get('cpu'))
    {
      session.view.body.cpu = os.cpus().map((cpu) =>
      {
        const
          total = Object.values(cpu.times).reduce((a, b) => a + b, 0),
          usage = Number(((total - cpu.times.idle) / total) * 100).toFixed(2)

        return { total, usage }
      })
    }

    // RAM usage
    if(request.url.searchParams.get('ram'))
    {
      const
        total = os.totalmem(),
        free  = os.freemem(),
        usage = Number((((total - free) / total) * 100).toFixed(2))

      session.view.body.ram = { total, usage }
    }
  }
}
