sap.ui.define([
    "zui5cadoclist/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox"
], function (BaseController, JSONModel, Fragment, MessageBox) {
    "use strict";

    return BaseController.extend("zui5cadoclist.controller.AddAttachments", {
        _fileToBase64: function (oFile) {
            return new Promise(function (resolve, reject) {
                if (!oFile) { resolve(null); return; }
                try {
                    var reader = new FileReader();
                    reader.onload = function (e) {
                        var s = (e && e.target && e.target.result) ? e.target.result : "";
                        var idx = s.indexOf(",");
                        var base64 = idx >= 0 ? s.substring(idx + 1) : s;
                        resolve(base64);
                    };
                    reader.onerror = function (err) { reject(err); };
                    reader.readAsDataURL(oFile);
                } catch (ex) {
                    reject(ex);
                }
            });
        },
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
            // Validate required header fields: Destination and ObjKey
            var sDest = (oItemHdr.Destination || "").trim();
            var sObjKey = (oItemHdr.ObjKey || "").trim();
            if (!sDest || !sObjKey) {
                this.showErrorMessage("Debe indicar Destino y Clave del Objeto (ObjKey)");
                return;
            }
            // Validate that all files have a Tipo de Objeto assigned
            var aMissingTypes = [];
            aItems.forEach(function (oUSItem) {
                var sTypeObj = "";
                var aAttrs = oUSItem.getAttributes ? oUSItem.getAttributes() : [];
                aAttrs.forEach(function (oAttr) {
                    var sTitle = oAttr.getTitle && oAttr.getTitle();
                    if (sTitle === "Tipo de Objeto") { sTypeObj = oAttr.getText(); }
                });
                if (!sTypeObj || String(sTypeObj).trim() === "") {
                    var sName = oUSItem.getFileName ? oUSItem.getFileName() : "(sin nombre)";
                    aMissingTypes.push(sName);
                }
            });
            if (aMissingTypes.length) {
                this.showErrorMessage("Asigna un tipo a todos los ficheros. Sin tipo: " + aMissingTypes.join(", "));
                return;
            }
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            var iOk = 0, iErr = 0, iPending = aItems.length;
            var fnDone = function () {
                if (iErr === 0) {
                    that.showSuccessMessage("Documentos adjuntados");
                    // Clear UI state: remove files and reset header fields
                    try {
                        var oUS = that.byId("idUploadSet");
                        if (oUS && oUS.removeAllItems) { oUS.removeAllItems(); }
                    } catch (e) { /* ignore */ }
                    try {
                        var oItemModel = that.getView().getModel("item");
                        if (oItemModel) { oItemModel.setData({ Destination: "", ObjKey: "" }); }
                    } catch (e2) { /* ignore */ }
                    // Navigate back if possible, else to list
                    try {
                        var oHistory = sap.ui.core.routing.History.getInstance();
                        var sPrev = oHistory && oHistory.getPreviousHash && oHistory.getPreviousHash();
                        if (sPrev !== undefined) { window.history.go(-1); }
                        else { that.getRouter().navTo("RouteDocumentList"); }
                    } catch (e3) {
                        that.getRouter().navTo("RouteDocumentList");
                    }
                } else {
                    MessageBox.error("Se adjuntaron " + iOk + " documentos. Errores: " + iErr);
                }
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
                that._fileToBase64(oFile).then(function (sBase64) {
                    var oPayload = {
                        ObjKey: oItemHdr.ObjKey || "",
                        Destination: oItemHdr.Destination || "",
                        Filename: oUSItem.getFileName ? oUSItem.getFileName() : "",
                        FileSize: iSize,
                        TypeObj: sTypeObj,
                        MimeType: sMedia,
                        Value: sBase64 || ""
                    };
                    oModel.create("/AddAtachmentsSet", oPayload, {
                        success: function () { iOk++; if (--iPending === 0) { fnDone(); } },
                        error: function () { iErr++; if (--iPending === 0) { fnDone(); } }
                    });
                }).catch(function () {
                    // Conversion error
                    iErr++; if (--iPending === 0) { fnDone(); }
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
            var aItems = oUploadSet.getItems ? oUploadSet.getItems() : [];
            if (!aItems || !aItems.length) { this.showMessage("No hay ficheros en la lista"); return; }

            var aFiles = aItems.map(function (oUSItem, idx) {
                var oFile = oUSItem.getFileObject && oUSItem.getFileObject();
                var iSize = (oFile && oFile.size) || 0;
                var sTypeObj = ""; var sDesc = "";
                var aAttrs = oUSItem.getAttributes ? oUSItem.getAttributes() : [];
                aAttrs.forEach(function (oAttr) {
                    var sTitle = oAttr.getTitle && oAttr.getTitle();
                    if (sTitle === "Tipo de Objeto") { sTypeObj = oAttr.getText(); }
                    if (sTitle === "Descripción") { sDesc = oAttr.getText(); }
                });
                return {
                    index: idx,
                    fileName: oUSItem.getFileName ? oUSItem.getFileName() : "",
                    size: iSize,
                    typeObj: sTypeObj,
                    typeDesc: sDesc
                };
            });

            var that = this;
            var openDialog = function () {
                if (!that._assignTypesDialog) { return; }
                if (!that._assignTypesModel) { that._assignTypesModel = new sap.ui.model.json.JSONModel(); }
                that._assignTypesModel.setData({ files: aFiles });
                that._assignTypesDialog.setModel(that._assignTypesModel, "assignTypes");
                that.getView().addDependent(that._assignTypesDialog);
                that._assignTypesDialog.open();
            };

            if (!this._assignTypesDialog) {
                Fragment.load({ name: "zui5cadoclist.view.fragments.AssignTypesDialog", controller: this }).then(function (oDialog) {
                    that._assignTypesDialog = oDialog;
                    openDialog();
                });
            } else {
                openDialog();
            }
        },

        onRowObjectTypeValueHelp: function (oEvent) {
            var oSrc = oEvent && oEvent.getSource ? oEvent.getSource() : null;
            if (!oSrc) { return; }
            var oCtx = oSrc.getBindingContext("assignTypes");
            if (!oCtx) { return; }
            var sPath = oCtx.getPath(); // e.g., /files/0
            var that = this;
            if (!this._rowTypePopover) {
                this._rowTypePopoverList = new sap.m.List({
                    noDataText: "No hay tipos de objeto disponibles",
                    items: { path: "/items", template: new sap.m.StandardListItem({ title: "{text}", description: "{key}", type: "Active" }) }
                });
                this._rowTypePopover = new sap.m.Popover({ showHeader: false, content: [this._rowTypePopoverList], placement: "Bottom" });
                this._rowTypePopoverList.attachItemPress(function (oEvt) {
                    var oLI = oEvt.getParameter('listItem');
                    var oBCtx = oLI && oLI.getBindingContext();
                    var sKey = oBCtx ? oBCtx.getProperty('key') : "";
                    var sText = oBCtx ? oBCtx.getProperty('text') : "";
                    if (that._assignTypesModel && that._currentRowPath) {
                        that._assignTypesModel.setProperty(that._currentRowPath + "/typeObj", sKey);
                        that._assignTypesModel.setProperty(that._currentRowPath + "/typeDesc", sText || sKey);
                    }
                    that._rowTypePopover.close();
                });
            }
            this._currentRowPath = sPath;
            var oModel = this.getOwnerComponent().getModel();
            oModel.read('/ObjectTypeSet', {
                success: function (oData) {
                    var a = oData && oData.results ? oData.results : [];
                    var aItems = a.map(function (o) { return { key: o.TypeObj || o.typeobj || '', text: o.Description || o.description || '' }; });
                    var oListModel = new sap.ui.model.json.JSONModel({ items: aItems });
                    that._rowTypePopoverList.setModel(oListModel);
                    that._rowTypePopoverList.bindItems({ path: '/items', template: new sap.m.StandardListItem({ title: '{text}', type: 'Active' }) });
                    that._rowTypePopover.openBy(oSrc);
                },
                error: function () { that.showErrorMessage('No se pudieron obtener los tipos de objeto'); }
            });
        },

        onAssignTypesDialogApply: function () {
            if (!this._assignTypesModel) { if (this._assignTypesDialog) { this._assignTypesDialog.close(); } return; }
            var aFiles = (this._assignTypesModel.getData() || {}).files || [];
            var oUploadSet = this.byId("idUploadSet");
            var aUSItems = oUploadSet ? oUploadSet.getItems() : [];
            aFiles.forEach(function (f) {
                var oUSItem = aUSItems[f.index];
                if (!oUSItem) { return; }
                var aAttrs = oUSItem.getAttributes ? oUSItem.getAttributes() : [];
                aAttrs.forEach(function (oAttr) {
                    var sTitle = oAttr.getTitle && oAttr.getTitle();
                    if (sTitle === "Tipo de Objeto") { oAttr.setText(f.typeObj || ""); }
                    //if (sTitle === "Descripción") { oAttr.setText(f.typeDesc || f.typeObj || ""); }
                });
            });
            if (this._assignTypesDialog) { this._assignTypesDialog.close(); }
        },

        onAssignTypesDialogCancel: function () {
            if (this._assignTypesDialog) { this._assignTypesDialog.close(); }
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
                    var oCtx = oItem.getBindingContext();
                    var sKey = oCtx ? oCtx.getProperty('key') : null;
                    var sText = oCtx ? oCtx.getProperty('text') : null;
                    if (sKey) {
                        var oItemModel = that.getView().getModel('item');
                        var oData = oItemModel.getData() || {};
                        // Usar la key para la validación y guardar el texto para mostrarlo tras validar
                        oData.Destination = sKey;
                        oData._destinationText = sText || sKey;
                        oItemModel.setData(oData);
                        that.getOwnerComponent().getModel().read('/RequiredFieldsSet', {
                            filters: [new sap.ui.model.Filter('Destination', sap.ui.model.FilterOperator.EQ, sKey)],
                            success: function (oResult) {
                                var aFields = [];
                                if (oResult && oResult.results) {
                                    aFields = oResult.results.map(function (o) { return { field: o.Field_id, description: o.Description, table: o.Table, tableField: o.TableField, type: o.Type, length: o.Length }; });
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
                    var aItems = a.map(function (o) { return { key: o.Destination, text: o.Description }; });
                    var oListModel = new sap.ui.model.json.JSONModel({ items: aItems });
                    that._destinationPopoverList.setModel(oListModel);
                    that._destinationPopoverList.bindItems({ path: '/items', template: new sap.m.StandardListItem({ title: '{text}',  type: 'Active' }) });
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
                        aFields = oResult.results.map(function (o) { return { field: o.Field_id, description: o.Description, table: o.Table, tableField: o.TableField, type: o.Type, length: o.Length }; });
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
