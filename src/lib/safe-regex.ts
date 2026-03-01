/**
 * Safe regex execution utility.
 *
 * Provides ReDoS-resistant pattern matching by rejecting patterns
 * with nested quantifiers before compiling them as RegExp.
 */

/**
 * Checks whether a regex pattern is safe to execute (no ReDoS risk).
 *
 * Uses a character-by-character parser that tracks group depth to detect
 * nested quantifiers at any level — including deeply nested groups like
 * ((a+))+, ((?:a+))+, ((a+)(b+))+, (a+|(b+))+, etc.
 *
 * Also rejects patterns exceeding 500 characters.
 */
export function isRegexSafe(pattern: string): boolean {
  if (pattern.length > 500) return false;

  // Stack tracks whether each open group contains a quantifier (+ or *).
  // When a group closes, we check if it's followed by a quantifier.
  // If so AND the group had a quantifier inside → nested quantifier → unsafe.
  const stack: boolean[] = [];

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    // Skip escaped characters
    if (ch === "\\") {
      i++;
      continue;
    }

    // Skip character classes [...]
    if (ch === "[") {
      i++;
      while (i < pattern.length && pattern[i] !== "]") {
        if (pattern[i] === "\\") i++;
        i++;
      }
      continue;
    }

    if (ch === "(") {
      stack.push(false);
    } else if (ch === ")") {
      const groupHadQuantifier = stack.pop() ?? false;
      const next = pattern[i + 1];
      const followedByQuantifier =
        next === "+" || next === "*" || next === "{";

      // Nested quantifier: group with inner quantifier, followed by outer quantifier
      if (groupHadQuantifier && followedByQuantifier) {
        return false;
      }

      // Propagate: a group with an inner quantifier matches variable-length strings
      if (groupHadQuantifier && stack.length > 0) {
        stack[stack.length - 1] = true;
      }

      // A quantified group is also a variable-length element in its parent
      if (followedByQuantifier && stack.length > 0) {
        stack[stack.length - 1] = true;
      }
    } else if (ch === "+" || ch === "*") {
      if (stack.length > 0) {
        stack[stack.length - 1] = true;
      }
    } else if (ch === "{") {
      if (stack.length > 0) {
        stack[stack.length - 1] = true;
      }
    }
  }

  // Verify the pattern compiles at all
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tests if a text matches a pattern using regex (case-insensitive).
 * Falls back to safe substring matching if the regex is unsafe or invalid.
 */
export function safeMatchesPattern(text: string, pattern: string): boolean {
  if (!isRegexSafe(pattern)) {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
}
