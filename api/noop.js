export default function handler(req, res) {
  const { play_with, alcohol, location, level } = req.body;

  res.status(200).json({
    play_with,
    alcohol,
    location,
    level
  });
}
