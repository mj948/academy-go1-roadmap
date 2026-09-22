import { handle } from "../src/vercel-adapter.js";
export const config = { api: { bodyParser: { sizeLimit: "4.5mb" } } };
export default handle;
