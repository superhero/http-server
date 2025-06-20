export default
{
  isValid(request, session)
  {
    const
      header      = request.headers['content-type'],
      lowerCased  = header.toLowerCase(),
      contentType = lowerCased.split(';')[0].split('*')[0].trim()

    return [session.route['criteria.content-type']].flat().some(supported =>
      supported.startsWith(contentType) || contentType.startsWith(supported.split('*')[0]))
  }
}
