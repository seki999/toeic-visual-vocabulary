import { fieldText, type Field, type Word } from "./types";

const rows: Field[][] = [
  ["word", "meaning"],
  ["collocation.en", "collocation.zh"],
  ["example.en"],
  ["example.zh"],
];

export function ImageOverlayContent({
  word,
  selected,
  showIpa,
}: {
  word: Word;
  selected: Field[];
  showIpa: boolean;
}) {
  const ipa = showIpa && (word.ipa.uk || word.ipa.us);
  return rows.map((fields, index) => {
    if (
      !fields.some((field) => selected.includes(field)) &&
      !(index === 0 && ipa)
    )
      return null;
    return (
      <div className="overlay-row" key={index}>
        {fields.map((field) => (
          <span className="overlay-cell" key={field}>
            {field === "meaning" && index === 0 && ipa && (
              <span className="image-ipa">
                {word.ipa.uk && <span>UK {word.ipa.uk}</span>}
                {word.ipa.us && <span>US {word.ipa.us}</span>}
              </span>
            )}
            {selected.includes(field) && (
              <span data-field={field}>{fieldText(word, field)}</span>
            )}
          </span>
        ))}
      </div>
    );
  });
}
