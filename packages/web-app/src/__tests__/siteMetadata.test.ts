import { SITE_DESCRIPTION, SITE_NAME, socialTitle, TITLE_TEMPLATE } from "../lib/siteMetadata";

describe("siteMetadata", () => {
  it("builds the title template from the site name", () => {
    expect(TITLE_TEMPLATE).toBe(`%s - ${SITE_NAME}`);
  });

  it("derives social titles from the same template the root layout uses", () => {
    // openGraph / twitter は title.template の適用対象外なので、ここがサフィックスの唯一の導出元になる
    expect(socialTitle("Editor")).toBe(TITLE_TEMPLATE.replace("%s", "Editor"));
    expect(socialTitle("Editor")).toBe(`Editor - ${SITE_NAME}`);
  });

  it("keeps the description within the length search results render", () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(0);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });
});
