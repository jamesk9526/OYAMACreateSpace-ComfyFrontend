/** Only bounded media payloads from the compiled H3 preview node can reach the renderer. */
export function h3PreviewData(data: Record<string, unknown>): string | undefined {
  if (
    data.node_id !== '7' ||
    typeof data.image !== 'string' ||
    data.image.length > 6 * 1024 * 1024 ||
    !data.image.length
  )
    return;
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(String(data.mime)) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data.image)
  )
    return;
  const bytes = Buffer.from(data.image, 'base64');
  const mime = data.mime;
  const valid =
    mime === 'image/jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8
      : mime === 'image/png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === 'image/webp'
          ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
          : bytes.toString('ascii', 4, 8) === 'ftyp';
  if (valid) return `data:${mime};base64,${data.image}`;
}
