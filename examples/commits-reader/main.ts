import { PortableCommitsReader } from "@jpahd/chatworks/commits-reader";
import type { CommitsIntentDetail } from "@jpahd/commits-core/contracts";
import {
  createCommitsFixture,
  type CommitsFixtureState,
} from "../../stories/fixtures/commits-reader.js";

const params = new URLSearchParams(location.search);
const state = (params.get("state") || "selected") as CommitsFixtureState;
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.theme = theme;
(document.querySelector("#state") as HTMLSelectElement).value = state;
(document.querySelector("#theme") as HTMLSelectElement).value = theme;
const fixture = createCommitsFixture(state);
export const reader = new PortableCommitsReader();
Object.assign(reader, {
  ...fixture,
  actions: ["return", "explain"],
  instanceKey: "example",
  exposed: true,
});
reader.addEventListener("commits-intent", (event) => {
  const { intent } = (event as CustomEvent<CommitsIntentDetail>).detail;
  if (intent.kind === "location") reader.location = intent.location;
});
document.querySelector("#specimen")!.append(reader);
document.body.dataset.ready = "";
