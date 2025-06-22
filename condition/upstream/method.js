export default
{
  isValid(request, route)
  {
    const
      methods = [route['condition.method']].flat(),
      mapped  = methods.map(method => method.toLowerCase()),
      isValid = mapped.includes(request.method.toLowerCase())

    return isValid
  }
}