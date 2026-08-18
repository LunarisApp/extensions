import { describe, expect, mock, test } from "bun:test";
import { Doc, encodeStateAsUpdateV2 } from "yjs";
import extension, { linksContentType } from "../src/index";
import { LINK_RECORD_KEY, LINKS_MAP_NAME } from "../src/domain";

describe("Links extension definition", () => {
  test("registers one persistent, compilable Link content type", () => {
    expect(extension.manifest).toMatchObject({
      id: "lunaris.links",
      version: "1.0.0",
    });
    expect(linksContentType).toMatchObject({
      compilable: true,
      createLabel: "Link",
      documentStorage: "yjs",
      id: "lunaris.links",
      name: "Link",
      type: "content-type",
    });
    expect(linksContentType.actions?.[0]?.id).toBe("open-in-panel");
  });

  test("registers the named browser renderer", () => {
    expect(extension.renderers?.browser).toBeTypeOf("function");
  });

  test("keeps the action alive until the saved document opens", async () => {
    const document = new Doc();
    document
      .getMap<string>(LINKS_MAP_NAME)
      .set(
        LINK_RECORD_KEY,
        JSON.stringify({
          label: "Lunaris docs",
          url: "https://lunaris.app/docs",
          version: 1,
        }),
      );
    const updateBase64 = Buffer.from(encodeStateAsUpdateV2(document)).toString(
      "base64",
    );
    document.destroy();

    const waitForDocumentPersistence = mock(async () => undefined);
    const getYjsDocumentUpdates = mock(async () => [{ updateBase64 }]);
    const openRightDockPanel = mock(() => undefined);
    const action = linksContentType.actions?.[0];
    if (!action || !("onClick" in action) || !action.onClick) {
      throw new Error("Open-in-panel action is missing");
    }

    const result = action.onClick({
      compileContext: {
        getProjectItemByDocumentId: async () => null,
        getProjectItemChildren: async () => [],
        getYjsDocumentUpdates,
      },
      contentTypeId: "lunaris.links",
      documentId: "document-1",
      downloadFileAttachment: async () => false,
      itemId: "item-1",
      itemName: "Lunaris docs",
      openRightDockPanel,
      waitForDocumentPersistence,
    });

    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(waitForDocumentPersistence).toHaveBeenCalledTimes(1);
    expect(getYjsDocumentUpdates).toHaveBeenCalledWith("document-1");
    expect(openRightDockPanel).toHaveBeenCalledWith({
      params: {
        title: "Lunaris docs",
        url: "https://lunaris.app/docs",
      },
      pluginId: "lunaris.links",
      renderer: "browser",
      titleKey: "linksExtension.link.browserTitle",
    });
  });
});
