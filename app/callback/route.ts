import { handleAuth } from "@workos-inc/authkit-nextjs";

// WorkOS redirects here after sign-in; AuthKit exchanges the code for a
// session cookie and sends the person back to where they started.
export const GET = handleAuth({ returnPathname: "/editor" });
