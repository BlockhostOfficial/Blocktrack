export default function MessageOf (name: string, data: any): string {
  return JSON.stringify({
    message: name,
    ...data
  })
}
