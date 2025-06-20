export default
{
  isdValid(request, session)
  {
    return [session.route['criteria.method']].flat().includes(request.method)
  }
}