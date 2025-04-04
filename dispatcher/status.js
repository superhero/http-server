export function locate(locator)
{
  const server = locator.locate('@superhero/http-server')
  return new StatusDispatcher(server)
}

/**
 * @memberof @superhero/http-server:dispatcher
 */
export default class StatusDispatcher
{
  started       = new Date()
  started_json  = this.started.toJSON().substring(0, 19).replace('T', ' ') + 'Z'

  constructor(server)
  {
    this.server = server
  }

  dispatch(_, session)
  {
    session.view.name       = this.server.name
    session.view.started    = started_json
    session.view.uptime     = this.started.getTime() - new Date().getTime()
    session.view.dispatched = String(this.server.dispatched)  + 'n'
    session.view.completed  = String(this.server.completed)   + 'n'
    session.view.abortions  = String(this.server.abortions)   + 'n'
    session.view.rejections = String(this.server.rejections)  + 'n'
  }
}