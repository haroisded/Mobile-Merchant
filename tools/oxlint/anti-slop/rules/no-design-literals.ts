import { defineRule } from "@oxlint/plugins";

// A string that is nothing but a colour: #rgb, #rgba, #rrggbb, #rrggbbaa, or an rgb()/rgba()/hsl()/
// hsla() call. Whole-string only, so "Order #10428" and "abc" are never mistaken for one.
const colourLiteral =
  /^\s*(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?)\([^)]*\))\s*$/i;

// The type properties docs/typography.md rule 2 keeps out of call sites. textTransform is not here:
// it has legitimate non-type uses, and the uppercase label lives in the theme token anyway.
const typeKeys = new Set(["fontSize", "fontWeight", "lineHeight", "letterSpacing", "fontFamily"]);

/**
 * Ban colour literals and inline type properties. Scoped in .oxlintrc.json: on for src/**, off for
 * src/themes.js, the one file allowed to define them (CLAUDE.md §3 rules 2 and 3).
 */
export const noDesignLiteralsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow colour literals and inline font properties outside the theme file.",
    },
    messages: {
      colour:
        "Colour literal outside src/themes.js. Read a key from the theme; if the design needs a colour the theme lacks, add the key to both themes (docs/visual-language.md §3).",
      type:
        "Inline `{{name}}` outside src/themes.js. Use a Paper Text variant; sizes live in the theme (docs/typography.md §2).",
    },
  },
  createOnce(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && colourLiteral.test(node.value)) {
          context.report({ node, messageId: "colour" });
        }
      },
      Property(node) {
        const key = node.key;
        const name =
          key.type === "Identifier"
            ? key.name
            : key.type === "Literal" && typeof key.value === "string"
              ? key.value
              : null;
        if (name !== null && typeKeys.has(name)) {
          context.report({ node: key, messageId: "type", data: { name } });
        }
      },
    };
  },
});
