export async function readEdgeErrorPayload(err: any): Promise<any | null> {
  const res: Response | undefined = err?.context;
  if (!res) return null;
  try { return await res.clone().json(); }
  catch {
    try { const txt = await res.clone().text(); return txt ? { error: txt } : null; }
    catch { return null; }
  }
}
