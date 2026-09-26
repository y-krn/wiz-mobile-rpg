import { getSideOpeningPosts as getSideOpeningPostsFromOwner } from "../../../../src/rules/renderer_openings";
import { getSideOpeningPosts as getSideOpeningPostsFromFacade } from "../../../../src/rules/renderer_openings.js";

const projection = { xl: [0, 1], leftTop: [0, 1], rightTop: [0, 1] };
const topology = [{ valid: true, z: 0, column: 0, leftBlocked: false, rightBlocked: false }];
const acceptedLegacyInputs: unknown[] = [null, 7, "topology", topology];

for (const input of acceptedLegacyInputs) {
  getSideOpeningPostsFromOwner(input, projection);
  getSideOpeningPostsFromFacade(input, projection);
}

const mutablePosts = getSideOpeningPostsFromOwner(topology, projection);
mutablePosts.push({ side: "left", z: 0, x: 0, top: 0, bottom: 1, width: 3 });
