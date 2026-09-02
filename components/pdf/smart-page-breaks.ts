/** Run immediately before print: nudge activities that would straddle pages onto the next page. */
export function addSmartPageBreaks(container: HTMLDivElement | null) {
  if (!container) return;

  const pageHeight = 1123;
  const minSpaceRequired = pageHeight / 3;

  const activityContainers = container.querySelectorAll(".activity-container");

  activityContainers.forEach((activityEl) => {
    const element = activityEl as HTMLElement;

    let offsetTop = 0;
    let parent: HTMLElement | null = element;

    while (parent && parent !== container) {
      offsetTop += parent.offsetTop;
      parent = parent.offsetParent as HTMLElement | null;
    }

    if (!parent) {
      const rect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      offsetTop = rect.top - containerRect.top;
    }

    const positionOnPage = offsetTop % pageHeight;
    const spaceRemaining = pageHeight - positionOnPage;

    if (spaceRemaining < minSpaceRequired && spaceRemaining > 100) {
      element.classList.add("force-page-break");
    } else {
      element.classList.remove("force-page-break");
    }
  });
}
