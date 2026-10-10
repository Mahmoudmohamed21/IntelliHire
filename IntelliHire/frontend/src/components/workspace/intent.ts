import type { Intent } from "./types";

/**
 * Maps a chat message to a feature. Anything that isn't a clear command
 * falls through to "ask" - a question answered from the CV text.
 */
export function detectIntent(text: string): Intent {
  const s = text.toLowerCase().trim();

  const mentionsCv = /\b(cv|cvs|resume|resumes|candidate|candidates|file|pdf)\b/;

  const wantsDelete = /\b(delete|remove|erase|discard|get rid of)\b/.test(s);

  if (wantsDelete && mentionsCv.test(s)) {
    return "delete";
  }

  if (wantsDelete && /\b(job|jobs|position|vacancy|opening)\b/.test(s)) {
    return "deleteJob";
  }

  if (
    /\b(new|create|add|post|open|make)\b.*\b(job|position|vacancy|role|opening)\b/.test(s)
  ) {
    return "newJob";
  }

  // Ranking must be checked before the library: "rank all candidates"
  // also matches the "all ... candidates" library pattern.
  if (
    /\b(rank|ranking|rankings|leaderboard|top candidates|best candidates?|compare (all )?candidates|who is the best|shortlist)\b/.test(s)
  ) {
    return "rank";
  }

  if (
    /^(my )?(cvs|resumes|candidates|library)\??$/.test(s) ||
    /\b(list|show|manage|see|view|all|uploaded|switch|change|choose|select|pick|which)\b.*\b(cvs|resumes|candidates)\b/.test(s) ||
    /\bmy (cvs|resumes)\b/.test(s)
  ) {
    return "library";
  }

  if (
    /^jobs?\??$/.test(s) ||
    /\b(list|show|choose|select|pick|switch|change|which|see|view)\b.*\bjobs\b/.test(s) ||
    /\b(change|switch|choose|select|pick)\b.*\bjob\b/.test(s)
  ) {
    return "jobs";
  }

  if (/\binterview score\b/.test(s)) return "decision";

  if (/\b(interview|mock|quiz me|practi[sc]e)\b/.test(s)) return "interview";

  if (
    /\b(decision|decide|should (i|we) hire|hire (him|her|them|this)|hiring|verdict|final (score|result|recommendation))\b/.test(s)
  ) {
    return "decision";
  }

  if (
    /\bskill ?gaps?\b|\bmissing skills?\b|\bgap analysis\b/.test(s) ||
    /\b(match|matches|matching|fit|suitable|suitability|compatib\w*)\b/.test(s)
  ) {
    return "match";
  }

  return "ask";
}

/** "decision with interview score 75" -> 75 */
export function extractScore(text: string): number | undefined {
  const m = text.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|\/\s*100|percent)?/);
  if (!m) return undefined;

  const value = Number(m[1]);

  return Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}
