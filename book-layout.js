/* Move complete content blocks onto measured sheets. Keep the original nodes so
   links, form values, and accessibility relationships survive a resize. */
window.PortfolioPagination = class PortfolioPagination {
  constructor(sourceLeaves) {
    this.front = sourceLeaves[0];
    this.back = sourceLeaves[sourceLeaves.length - 1];
    this.fragments = [];
    this.chapters = sourceLeaves.slice(1, -1).map((leaf, index) => {
      const content = leaf.querySelector(".page-content");
      const heading = content.querySelector(":scope > .page-heading");
      const units = [];
      const collect = (node, wrappers = []) => {
        if (node === heading) return;
        if (
          node.matches(
            ".profile-page, .profile-copy, .summary-box, .check-list, .timeline, .education-list, .tech-groups, .achievement-list, .contact-box, .contact-list, .closing-note",
          )
        ) {
          [...node.children].forEach((child) =>
            collect(child, [...wrappers, node]),
          );
        } else units.push({ node, wrappers });
      };
      [...content.children].forEach((node) => collect(node));
      return {
        key: String(index + 1),
        id: leaf.id,
        title: leaf.dataset.title,
        heading,
        units,
      };
    });
  }

  createSheet(chapter, part) {
    const leaf = document.createElement("section");
    leaf.className = "leaf paper-page";
    leaf.dataset.title = chapter.title;
    leaf.dataset.chapter = chapter.key;
    leaf.dataset.part = String(part);
    leaf.id = part ? `${chapter.id}-continued-${part}` : chapter.id;
    leaf.innerHTML =
      '<div class="page-running-head"><span>Amoni Kevin</span><span></span></div><div class="page-content" tabindex="-1"></div><footer class="page-folio"><span>Selected work / 2026</span><span></span></footer>';
    leaf.querySelector(".page-running-head span:last-child").textContent =
      chapter.title;
    const content = leaf.querySelector(".page-content");
    content.setAttribute(
      "aria-label",
      `Read ${chapter.title.toLowerCase()}${part ? ", continued" : ""}`,
    );
    if (!part && chapter.heading) content.append(chapter.heading);
    if (part) {
      const continuation = document.createElement("p");
      continuation.className = "continuation-heading";
      continuation.textContent = `${chapter.title} / continued`;
      content.append(continuation);
    }
    return { leaf, content, wrappers: new Map(), units: 0 };
  }

  appendUnit(sheet, unit) {
    let parent = sheet.content;
    for (const source of unit.wrappers) {
      if (!sheet.wrappers.has(source)) {
        const wrapper = source.cloneNode(false);
        wrapper.removeAttribute("id");
        parent.append(wrapper);
        sheet.wrappers.set(source, wrapper);
      }
      parent = sheet.wrappers.get(source);
    }
    parent.append(unit.node);
  }

  fits(sheet) {
    // Include margins and flex/grid gaps through scrollHeight, plus a small
    // rounding allowance. The content area never gets a scrollbar.
    return sheet.content.scrollHeight <= sheet.content.clientHeight + 1;
  }

  splitParagraph(node) {
    const text = node.textContent;
    const middle = text.indexOf(" ", Math.floor(text.length / 2));
    if (middle < 1 || middle >= text.length - 1) return null;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let current,
      offset = middle;
    while ((current = walker.nextNode())) {
      if (offset <= current.length) break;
      offset -= current.length;
    }
    if (!current) return null;
    const firstRange = document.createRange();
    firstRange.selectNodeContents(node);
    firstRange.setEnd(current, offset);
    const lastRange = document.createRange();
    lastRange.selectNodeContents(node);
    lastRange.setStart(current, offset);
    return [firstRange, lastRange].map((range) => {
      const paragraph = node.cloneNode(false);
      paragraph.removeAttribute("id");
      paragraph.append(range.cloneContents());
      return paragraph;
    });
  }

  paginate(width, height) {
    // Reassemble blocks split for a smaller screen before measuring again.
    // Move the same nodes back so form values and listeners survive rotation.
    this.fragments.reverse().forEach(({ node, children }) => {
      node.replaceChildren(...children);
    });
    this.fragments = [];
    const probe = document.createElement("div");
    probe.className = "pagination-probe";
    probe.setAttribute("aria-hidden", "true");
    probe.inert = true;
    probe.style.setProperty("--sheet-width", `${width}px`);
    probe.style.setProperty("--sheet-height", `${height}px`);
    document.body.append(probe);
    const pages = [this.front];
    for (const chapter of this.chapters) {
      const units = [...chapter.units];
      let part = 0;
      let sheet = this.createSheet(chapter, part);
      probe.append(sheet.leaf);
      for (let index = 0; index < units.length; index++) {
        const unit = units[index];
        this.appendUnit(sheet, unit);
        if (!this.fits(sheet) && sheet.units) {
          unit.node.remove();
          // Remove empty containers created by the rejected block.
          [...sheet.wrappers.values()].reverse().forEach((wrapper) => {
            if (!wrapper.children.length) wrapper.remove();
          });
          pages.push(sheet.leaf);
          sheet = this.createSheet(chapter, ++part);
          probe.append(sheet.leaf);
          this.appendUnit(sheet, unit);
        }
        if (
          !this.fits(sheet) &&
          unit.node.children.length > 1 &&
          !unit.node.matches("form, p, h1, h2, h3, h4, h5, h6")
        ) {
          // An unusually short viewport may need one project/entry spread over
          // two sheets. Split at its own block boundaries, preserving all text.
          unit.node.remove();
          this.fragments.push({
            node: unit.node,
            children: [...unit.node.childNodes],
          });
          const fragment = unit.node.cloneNode(false);
          fragment.classList.add("flow-fragment");
          const children = [...unit.node.children].map((node) => ({
            node,
            wrappers: [...unit.wrappers, fragment],
          }));
          units.splice(index, 1, ...children);
          index--;
          continue;
        }
        if (
          !this.fits(sheet) &&
          unit.node.matches("p, h1, h2, h3, h4, h5, h6")
        ) {
          const paragraphs = this.splitParagraph(unit.node);
          if (paragraphs) {
            unit.node.remove();
            units.splice(
              index,
              1,
              ...paragraphs.map((node) => ({ node, wrappers: unit.wrappers })),
            );
            index--;
            continue;
          }
        }
        sheet.units++;
      }
      pages.push(sheet.leaf);
    }
    // A hardcover needs an even number of inner pages. An intentional endpaper
    // fills an odd final spread without losing or duplicating chapter content.
    if ((pages.length - 1) % 2) {
      const endpaper = this.createSheet(
        { key: "endpaper", id: "endpaper", title: "Endpaper" },
        0,
      );
      endpaper.content.innerHTML =
        '<div class="endpaper-mark" aria-hidden="true">AK<span>Engineering with intent.</span></div>';
      pages.push(endpaper.leaf);
    }
    pages.push(this.back);
    pages.forEach((leaf, index) => {
      if (!leaf.classList.contains("paper-page")) return;
      leaf.querySelector(".page-folio span:last-child").textContent = String(
        index,
      ).padStart(2, "0");
      leaf.setAttribute(
        "aria-label",
        `${leaf.dataset.title}${Number(leaf.dataset.part) ? ", continued" : ""}, page ${index}`,
      );
    });
    // The caller moves the pages into the engine synchronously before paint.
    probe.remove();
    return pages;
  }
};
