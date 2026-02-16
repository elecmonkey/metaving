const handler = (c: any) => {
  const id = c.req.param("id")
  return c.json({ id })
}

export default handler
