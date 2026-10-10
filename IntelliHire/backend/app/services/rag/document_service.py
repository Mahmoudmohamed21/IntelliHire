from typing import List


def _split_long_line(line: str, size: int) -> List[str]:
    """Break one very long line at word boundaries."""

    pieces, current = [], ""

    for word in line.split():
        if current and len(current) + 1 + len(word) > size:
            pieces.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()

    if current:
        pieces.append(current)

    return pieces


def split_text(
    text: str,
    chunk_size: int = 800,
    chunk_overlap: int = 150
) -> List[str]:
    """
    Split text into chunks that follow the document's own line structure
    (so sections and bullet points are not cut in half), with a small
    overlap of whole lines between neighbouring chunks.
    """

    if not text or not text.strip():
        return []

    lines: List[str] = []

    for raw in text.replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line:
            continue
        if len(line) > chunk_size:
            lines.extend(_split_long_line(line, chunk_size))
        else:
            lines.append(line)

    chunks: List[str] = []
    current: List[str] = []
    length = 0

    for line in lines:

        if current and length + len(line) + 1 > chunk_size:

            chunks.append("\n".join(current))

            # Carry trailing whole lines forward as overlap.
            carried: List[str] = []
            carried_len = 0
            for previous in reversed(current):
                if carried_len + len(previous) + 1 > chunk_overlap:
                    break
                carried.insert(0, previous)
                carried_len += len(previous) + 1

            current = carried
            length = carried_len

        current.append(line)
        length += len(line) + 1

    if current:
        tail = "\n".join(current)
        # Don't emit a final chunk that is only the overlap we just carried.
        if not chunks or tail != chunks[-1]:
            chunks.append(tail)

    return chunks
