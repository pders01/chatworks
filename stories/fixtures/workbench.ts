import { WorkbenchRegistry } from "@jpahd/chatworks/workbench";

export function createWorkbenchFixture() {
  const registry = new WorkbenchRegistry();
  for (const [id, title, text] of [
    ["garden.overview", "Overview", "Beds are ready for spring planting."],
    ["garden.schedule", "Schedule", "Water seedlings in the morning."],
  ]) {
    registry.registerView({
      id,
      title,
      mount(container) {
        const article = document.createElement("article");
        const heading = document.createElement("h2");
        heading.textContent = title;
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        article.append(heading, paragraph);
        container.append(article);
        return () => article.remove();
      },
    });
    registry.registerCommand({
      id: `${id}.open`,
      title: `Open ${title.toLowerCase()}`,
      category: "Garden",
      run() {
        registry.openView(id);
      },
    });
  }
  registry.openView("garden.overview");
  return registry;
}
