export default
{
  isValid(request, session)
  {
    return [session.route['condition.method']].flat().includes(request.method)
  }
}