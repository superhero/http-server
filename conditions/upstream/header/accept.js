export default
{
  isValid(request, session)
  {
    const
      header      = request.headers['accept'],
      lowerCased  = header.toLowerCase(),
      accept      = lowerCased.split(';')[0].split('*')[0].trim()

    return [session.route['criteria.accept']].flat().some(supported =>
      supported.startsWith(accept) || accept.startsWith(supported.split('*')[0]))
  }
}
