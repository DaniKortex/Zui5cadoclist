sap.ui.define([
    "zui5cadoclist/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox"
], function (BaseController, JSONModel, Fragment, MessageBox) {
    "use strict";

    return BaseController.extend("zui5cadoclist.controller.AddAttachments", {
        onInit: function () {
            var oModel = new JSONModel({ Destination: "", ObjKey: "" });
            this.getView().setModel(oModel, "item");
            // Attach removal handler programmatically to avoid XML version mismatches
            var oUploadSet = this.byId("idUploadSet");
            if (oUploadSet && oUploadSet.attachItemRemoved) {
                oUploadSet.attachItemRemoved(this.onUploadSetItemRemoved.bind(this));
            }
        },
        onSave: function () {
            var oUploadSet = this.byId("idUploadSet");
            var aItems = oUploadSet ? oUploadSet.getItems() : [];
            if (!aItems || !aItems.length) { this.showMessage("No hay documentos para adjuntar"); return; }
            var oItemHdr = this.getView().getModel("item").getData() || {};
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            var iOk = 0, iErr = 0, iPending = aItems.length;
            var fnDone = function () {
                if (iErr === 0) { that.showSuccessMessage("Documentos adjuntados"); }
                else { MessageBox.error("Se adjuntaron " + iOk + " documentos. Errores: " + iErr); }
                var oRouter = that.getRouter(); if (oRouter) { oRouter.navTo("DocumentList"); }
            };
            aItems.forEach(function (oUSItem) {
                var oFile = oUSItem.getFileObject && oUSItem.getFileObject();
                var iSize = (oFile && oFile.size) || 0;
                var sMedia = oUSItem.getMediaType ? oUSItem.getMediaType() : ((oFile && oFile.type) || "application/pdf");
                // Read TypeObj/ObjectDescription from attributes if present
                var sTypeObj = ""; var sObjDesc = "";
                var aAttrs = oUSItem.getAttributes ? oUSItem.getAttributes() : [];
                aAttrs.forEach(function (oAttr) {
                    var sTitle = oAttr.getTitle && oAttr.getTitle();
                    if (sTitle === "Tipo de Objeto") { sTypeObj = oAttr.getText(); }
                    if (sTitle === "Descripción") { sObjDesc = oAttr.getText(); }
                });
                var oPayload = {
                    Destination: oItemHdr.Destination || "",
                    ObjKey: oItemHdr.ObjKey || "",
                    FileName: oUSItem.getFileName ? oUSItem.getFileName() : "",
                    FileSize: iSize,
                    TypeObj: sTypeObj,
                    ObjectDescription: sObjDesc,
                    MediaType: sMedia,
                    Url: oUSItem.getUrl ? oUSItem.getUrl() : ""
                };
                oModel.create("/AddAttachmentsSet", oPayload, {
                    success: function () { iOk++; if (--iPending === 0) { fnDone(); } },
                    error: function () { iErr++; if (--iPending === 0) { fnDone(); } }
                });
            });
        },
        onUploadSetAfterItemAdded: function (oEvent) {
            var oItem = oEvent.getParameter && oEvent.getParameter("item") ? oEvent.getParameter("item") : null;
            if (!oItem) { return; }
            var oFile = oItem.getFileObject && oItem.getFileObject();
            var iSize = (oFile && oFile.size) || 0;
            var sMedia = oItem.getMediaType && oItem.getMediaType();
            // Enrich item with attributes (display only). Editing can be added via a popover flow.
            if (oItem.removeAllAttributes) { oItem.removeAllAttributes(); }
            if (oItem.addAttribute) {
                oItem.addAttribute(new sap.m.ObjectAttribute({ title: "Tamaño", text: iSize }));
                oItem.addAttribute(new sap.m.ObjectAttribute({ title: "Tipo de Objeto", text: "" }));
                oItem.addAttribute(new sap.m.ObjectAttribute({ title: "Descripción", text: "" }));
            }
        },

        onAssignTypeToSelected: function () {
            var oUploadSet = this.byId("idUploadSet");
            if (!oUploadSet) { return; }
            var aSel = oUploadSet.getSelectedItems ? oUploadSet.getSelectedItems() : [];
            var oUSItem = aSel && aSel.length ? aSel[0] : null;
            if (!oUSItem) {
                // Fallback: use the last added item if nothing is selected
                var aItems = oUploadSet.getItems ? oUploadSet.getItems() : [];
                if (aItems && aItems.length) {
                    oUSItem = aItems[aItems.length - 1];
                } else {
                    this.showMessage("No hay ficheros en la lista");
                    return;
                }
            }
            var that = this;
            // Build or reuse a simple popover list for object types
            if (!this._objectTypePopover) {
                this._objectTypePopoverList = new sap.m.List({
                    noDataText: "No hay tipos de objeto disponibles",
                    items: { path: "/items", template: new sap.m.StandardListItem({ title: "{text}", description: "{key}", type: "Active" }) }
                });
                this._objectTypePopover = new sap.m.Popover({ showHeader: false, content: [this._objectTypePopoverList], placement: "Bottom" });
                this._objectTypePopoverList.attachItemPress(function (oEvt) {
                    var oLI = oEvt.getParameter('listItem');
                    var oCtx = oLI && oLI.getBindingContext();
                    var sKey = oCtx ? oCtx.getProperty('key') : "";
                    var sText = oCtx ? oCtx.getProperty('text') : "";
                    // Update UploadSetItem attributes
                    var aAttrs = oUSItem.getAttributes ? oUSItem.getAttributes() : [];
                    aAttrs.forEach(function (oAttr) {
                        var sTitle = oAttr.getTitle && oAttr.getTitle();
                        if (sTitle === "Tipo de Objeto") { oAttr.setText(sKey); }
                        if (sTitle === "Descripción") { oAttr.setText(sText || sKey); }
                    });
                    that._objectTypePopover.close();
                });
            }
            var oModel = this.getOwnerComponent().getModel();
            oModel.read('/ObjectTypeSet', {
                success: function (oData) {
                    var a = oData && oData.results ? oData.results : [];
                    var aItems = a.map(function (o) { return { key: o.TypeObj || o.typeobj || '', text: o.Description || o.description || '' }; });
                    var oListModel = new sap.ui.model.json.JSONModel({ items: aItems });
                    that._objectTypePopoverList.setModel(oListModel);
                    that._objectTypePopoverList.bindItems({ path: '/items', template: new sap.m.StandardListItem({ title: '{text}', description: '{key}', type: 'Active' }) });
                    // Open at toolbar button if available; else center
                    var oBtn = that.byId('idUSAssignTypeBtn');
                    if (oBtn) { that._objectTypePopover.openBy(oBtn); }
                    else { that._objectTypePopover.open(); }
                },
                error: function () { that.showErrorMessage('No se pudieron obtener los tipos de objeto'); }
            });
        },
        onUploadSetItemRemoved: function (/*oEvent*/) {
            // No additional sync needed as we rely on UploadSet internal items only
        },
        onDestinationValueHelp: function (oEvent) {
            var that = this;
            var oSource = oEvent && oEvent.getSource ? oEvent.getSource() : null;
            this._destinationValueHelpSource = oSource;

            if (!this._destinationPopover) {
                this._destinationPopoverList = new sap.m.List({
                    noDataText: "No hay destinos disponibles",
                    items: {
                        path: "/items",
                        template: new sap.m.StandardListItem({ title: "{text}", description: "{key}", type: "Active" })
                    }
                });
                this._destinationPopover = new sap.m.Popover({ showHeader: false, content: [this._destinationPopoverList], placement: "Bottom" });
                this._destinationPopoverList.attachItemPress(function (oEvt) {
                    var oItem = oEvt.getParameter('listItem'); if (!oItem) { return; }
                    var oCtx = oItem.getBindingContext(); var sKey = oCtx ? oCtx.getProperty('key') : null;
                    if (sKey) {
                        var oItemModel = that.getView().getModel('item');
                        var oData = oItemModel.getData() || {};
                        oData.Destination = sKey;
                        oItemModel.setData(oData);
                        that.getOwnerComponent().getModel().read('/RequiredFieldsSet', {
                            filters: [new sap.ui.model.Filter('Destination', sap.ui.model.FilterOperator.EQ, sKey)],
                            success: function (oResult) {
                                var aFields = [];
                                if (oResult && oResult.results) {
                                    aFields = oResult.results.map(function (o) { return { field: o.Field_id || o.FieldId || o.Field || "", description: o.Description || "", table: o.Table || "", tableField: o.TableField || "", type: o.Type || "", length: o.Length || "" }; });
                                }
                                that._openDynamicEditDialog(oData, aFields);
                            },
                            error: function () { that.showErrorMessage('No se pudieron obtener los campos requeridos para el destino seleccionado'); }
                        });
                    }
                    that._destinationPopover.close();
                });
            }

            var oModel = this.getOwnerComponent().getModel();
            oModel.read('/DestinationAssignSet', {
                success: function (oData) {
                    var a = oData && oData.results ? oData.results : [];
                    var aItems = a.map(function (o) { return { key: o.Destination || o.Key || o.Id || o.Name || '', text: o.Description || o.Destination || o.Name || o.Key || '' }; });
                    var oListModel = new sap.ui.model.json.JSONModel({ items: aItems });
                    that._destinationPopoverList.setModel(oListModel);
                    that._destinationPopoverList.bindItems({ path: '/items', template: new sap.m.StandardListItem({ title: '{text}', description: '{key}', type: 'Active' }) });
                    if (oSource) { that._destinationPopover.openBy(oSource); }
                },
                error: function () { that.showErrorMessage('No se pudieron obtener los destinos'); }
            });
        },
        onObjKeyLinkPress: function () {
            var oItem = this.getView().getModel('item').getData() || {};
            var sDestination = oItem.Destination;
            var that = this;
            if (!sDestination || (typeof sDestination === 'string' && sDestination.trim() === '')) {
                this.showMessage('Seleccione un destino antes de editar clave');
                return;
            }
            this.getOwnerComponent().getModel().read('/RequiredFieldsSet', {
                filters: [new sap.ui.model.Filter('Destination', sap.ui.model.FilterOperator.EQ, sDestination)],
                success: function (oResult) {
                    var aFields = [];
                    if (oResult && oResult.results) {
                        aFields = oResult.results.map(function (o) { return { field: o.Field_id || o.FieldId || o.Field || "", description: o.Description || "", table: o.Table || "", tableField: o.TableField || "", type: o.Type || "", length: o.Length || "" }; });
                    }
                    that._openDynamicEditDialog(oItem, aFields);
                },
                error: function () { that.showErrorMessage("No se pudieron obtener los campos requeridos para el destino seleccionado"); }
            });
        },

        /**
         * Value help for Object Type (controller-local): reads '/ObjectTypeSet' and sets TypeObj + ObjectDescription
         */
        onObjectTypeValueHelp: function (oEvent) {
            var that = this;
            var oSource = oEvent && oEvent.getSource ? oEvent.getSource() : null;
            this._objectTypeValueHelpSource = oSource;

            if (!this._objectTypePopover) {
                this._objectTypePopoverList = new sap.m.List({
                    noDataText: "No hay tipos de objeto disponibles",
                    items: {
                        path: "/items",
                        template: new sap.m.StandardListItem({ title: "{text}", description: "{key}", type: "Active" })
                    }
                });
                this._objectTypePopover = new sap.m.Popover({ showHeader: false, content: [this._objectTypePopoverList], placement: "Bottom" });
                this._objectTypePopoverList.attachItemPress(function (oEvt) {
                    var oItem = oEvt.getParameter('listItem'); if (!oItem) { return; }
                    var oCtx = oItem.getBindingContext(); var sKey = oCtx ? oCtx.getProperty('key') : null; var sText = oCtx ? oCtx.getProperty('text') : null;
                    if (sKey) {
                        var oItemModel = that.getView().getModel('item');
                        var oData = oItemModel.getData() || {};
                        oData.TypeObj = sKey;
                        oData.ObjectDescription = sText || sKey;
                        oItemModel.setData(oData);
                    }
                    that._objectTypePopover.close();
                });
            }

            var oModel = this.getOwnerComponent().getModel();
            oModel.read('/ObjectTypeSet', {
                success: function (oData) {
                    var a = oData && oData.results ? oData.results : [];
                    var aItems = a.map(function (o) { return { key: o.TypeObj || o.typeobj || '', text: o.Description || o.description || '' }; });
                    var oListModel = new sap.ui.model.json.JSONModel({ items: aItems });
                    that._objectTypePopoverList.setModel(oListModel);
                    that._objectTypePopoverList.bindItems({ path: '/items', template: new sap.m.StandardListItem({ title: '{text}', description: '{key}', type: 'Active' }) });
                    if (oSource) { that._objectTypePopover.openBy(oSource); }
                },
                error: function () { that.showErrorMessage('No se pudieron obtener los tipos de objeto'); }
            });
        }
    });
});
