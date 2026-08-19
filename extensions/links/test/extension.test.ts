import { describe, expect, mock, test } from "bun:test";
import extension, { linksContentType } from "../src/index";
import { LinkWebsiteRenderer } from "../src/link-viewer";

describe("Links extension definition", () => {
  test("registers one persistent, compilable Link content type", () => {
    expect(extension.manifest).toMatchObject({
      id: "lunaris.links",
      version: "1.0.1",
    });
    expect(linksContentType).toMatchObject({
      compilable: true,
      createLabel: "Link",
      documentStorage: "yjs",
      id: "lunaris.links",
      name: "Link",
      renderer: LinkWebsiteRenderer,
      type: "content-type",
    });
    expect(linksContentType.actions?.[0]?.id).toBe("edit-link");
  });

  test("registers the named browser and manager renderers", () => {
    expect(extension.renderers?.browser).toBeTypeOf("function");
    expect(extension.renderers?.manager).toBeTypeOf("function");
  });

  test("opens the management renderer from the edit action", () => {
    const openRightDockPanel = mock(() => undefined);
    const action = linksContentType.actions?.[0];
    if (!action || !("onClick" in action) || !action.onClick) {
      throw new Error("Edit-link action is missing");
    }

    action.onClick({
      compileContext: {
        getProjectItemByDocumentId: async () => null,
        getProjectItemChildren: async () => [],
        getYjsDocumentUpdates: async () => [],
      },
      contentTypeId: "lunaris.links",
      documentId: "document-1",
      downloadFileAttachment: async () => false,
      itemId: "item-1",
      itemName: "Lunaris docs",
      openRightDockPanel,
    });

    expect(openRightDockPanel).toHaveBeenCalledWith({
      params: {
        documentId: "document-1",
        itemId: "item-1",
      },
      pluginId: "lunaris.links",
      renderer: "manager",
      titleKey: "linksExtension.link.editTitle",
    });
  });
});
