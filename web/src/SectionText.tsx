const LONG_BODY_CHARS = 220;

export function SectionText({ text }: { text: string }) {
  const long = text.length > LONG_BODY_CHARS || text.split("\n").length > 4;
  return <p className={`section-body${long ? " section-body-dense" : ""}`}>{text}</p>;
}
