// Site settings. One place for the contract address, the name, the tagline and the repository.
//
// DEMO_CONTRACT is the deployed copy the site reads when NEXT_PUBLIC_CONTRACT is unset. It is filled
// in once the contract is deployed; while both are empty every page says the contract is not
// deployed yet, and the whole site still works with NEXT_PUBLIC_MOCK=1.
export const DEMO_CONTRACT: string = "";

export const SITE_NAME = "Sitter";
export const SITE_TAGLINE = "Pet and house sitting, paid day by day for what the report shows done.";
export const SITE_LINE =
  "The owner's care instructions are fixed before the money moves; each evening the validators read the sitter's report against every instruction, and that day's pay is released only for the instructions it shows done.";

/**
 * The public source repository. No account name is written into the repository: NEXT_PUBLIC_REPO_URL
 * names it, and on Vercel the repository the site was built from names it by itself (its system
 * variables NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER and _SLUG). The footer's Source link is hidden while
 * neither names one.
 */
const builtFrom =
  process.env.NEXT_PUBLIC_VERCEL_GIT_PROVIDER === "github" && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG
    ? `https://github.com/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER}/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG}`
    : "";
export const REPO_URL: string = process.env.NEXT_PUBLIC_REPO_URL || builtFrom || "";

/** The contract in use: the deploy's environment first, then the committed address. */
export const contractAddress = (): string => process.env.NEXT_PUBLIC_CONTRACT || DEMO_CONTRACT || "";
