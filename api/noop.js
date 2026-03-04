export async function POST(request) {
  const body = await request.json();
  const { play_with, alcohol, location, level } = body;

  return Response.json({ play_with, alcohol, location, level });
}
