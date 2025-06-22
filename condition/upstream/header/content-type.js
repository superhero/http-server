export default
{
  isValid(request, route)
  {
    const
      header      = request.headers['content-type'],
      lowerCased  = header.toLowerCase(),
      contentType = lowerCased.split(';')[0].split('*')[0].trim()

    return [route['condition.content-type']].flat().some(supported =>
      supported.startsWith(contentType) || contentType.startsWith(supported.split('*')[0]))
  }
}
