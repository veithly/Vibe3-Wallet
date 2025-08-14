export function wrapUntrustedContent(content: string): string {
  return `<untrusted_content>\n${content}\n</untrusted_content>`;
}
