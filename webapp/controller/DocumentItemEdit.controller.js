sap.ui.define([
    "zui5cadoclist/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/Popover",
    "sap/m/List",
    "sap/m/StandardListItem",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Fragment, Popover, List, StandardListItem, MessageBox, Filter, FilterOperator) {
    "use strict";
    return BaseController.extend("zui5cadoclist.controller.DocumentItemEdit", {
        onInit: function () {
            var oRouter = this.getRouter();
            oRouter.getRoute("RouteDocumentItemEdit").attachPatternMatched(this._onRouteMatched, this);
            this._sPdfBlobUrl = null;
            this.getView().setModel(new JSONModel({}), "item");
        },

        /**
         * Determine if Error value allows editing: non-empty string → editable
         * @private
         */
        _errorAllowsEdit: function (vError) {
            if (vError === null || vError === undefined) { return false; }
            if (typeof vError !== 'string') { return false; }
            var s = vError.trim();
            return s !== '';
        },

        /**
         * Formatter for Destination editable state: only editable when Error contains P or E
         */
        formatDestinationEditable: function (vError) {
            return this._errorAllowsEdit(vError);
        },

        /**
         * Formatter for ObjKey edit button visibility — same logic as DocumentList
         */
        formatEditVisible: function (vError, vObjKey, vDestination) {
            var bErrorAllowed = this._errorAllowsEdit(vError);
            var bHasDestination = (typeof vDestination === 'string' && vDestination.trim() !== '');
            return !!(bErrorAllowed && bHasDestination);
        },

        _onRouteMatched: function (oEvent) {
            var sDocId = oEvent.getParameter && oEvent.getParameter("arguments") && oEvent.getParameter("arguments").DocId;
            if (!sDocId) { return; }
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            this.getView().setBusy(true);
            var sKey;
            try {
                sKey = oModel.createKey('/PdfListSet', { DocId: sDocId });
            } catch (e) {
                sKey = "/PdfListSet('" + encodeURIComponent(sDocId) + "')";
            }
            oModel.read(sKey, {
                success: function (oData) {
                    that.getView().setBusy(false);
                    that.getView().getModel('item').setData(oData || {});
                    try { that._originalItem = JSON.parse(JSON.stringify(oData || {})); } catch (e) { that._originalItem = (oData || {}); }
                    // create blob url for pdf if present
                    try {
                        if (oData && oData.Pdf) {
                            var ab = null;
                            if (oData.Pdf instanceof ArrayBuffer) { ab = oData.Pdf; }
                            else if (Array.isArray(oData.Pdf)) { ab = new Uint8Array(oData.Pdf).buffer; }
                            else if (typeof oData.Pdf === 'string') {
                                var binStr = atob(oData.Pdf.replace(/\s/g, '').replace(/-/g, '+'));
                                var len = binStr.length;
                                var bytes = new Uint8Array(len);
                                for (var i = 0; i < len; i++) { bytes[i] = binStr.charCodeAt(i); }
                                ab = bytes.buffer;
                            }
                            if (ab) {
                                if (that._sPdfBlobUrl && URL && URL.revokeObjectURL) { URL.revokeObjectURL(that._sPdfBlobUrl); }
                                var blob = new Blob([ab], { type: 'application/pdf' });
                                that._sPdfBlobUrl = URL.createObjectURL(blob);
                                jQuery.sap.addUrlWhitelist("blob"); // register blob url as whitelist
                                that.getView().getModel('item').setProperty("/pdfUrl", that._sPdfBlobUrl);

                            }
                        }
                    } catch (e) { console.error(e); }
                },
                error: function () {
                    that.getView().setBusy(false);
                }
            });
        },

        onSave: function () {
            var oItem = this.getView().getModel('item').getData();
            if (!oItem || !oItem.DocId) { this.showErrorMessage('Documento no válido'); return; }
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            var sPath;
            try {
                sPath = oModel.createKey('/PdfListSet', { DocId: oItem.DocId });
            } catch (e) {
                sPath = "/PdfListSet('" + encodeURIComponent(oItem.DocId) + "')";
            }
            var oPayload = {
                TypeDoc: oItem.TypeDoc,
                TypeObj: oItem.TypeObj,
                ObjectDescription: oItem.ObjectDescription,
                Destination: oItem.Destination,
                ObjKey: oItem.ObjKey
            };
            oModel.update(sPath, oPayload, {
                success: function () {
                    try {
                        var oItemModel = that.getView().getModel('item');
                        var oItem = oItemModel.getData() || {};
                        if (oItem) { delete oItem._pendingUpdate; oItem._validated = false; oItemModel.setData(oItem); }
                    } catch (e) { /* ignore */ }
                    that.showSuccessMessage('Datos guardados');
                    that.getRouter().navTo('RouteDocumentList');
                },
                error: function () {
                    that.showErrorMessage('Error al guardar');
                }
            });
        },

        /**
         * Value help for Destination (reuses list logic)
         */
        onDestinationValueHelp: function (oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            this._destinationValueHelpSource = oSource;

            if (!this._destinationPopover) {
                this._destinationPopoverList = new List({
                    noDataText: "No hay destinos disponibles",
                    items: {
                        path: "/items",
                        template: new StandardListItem({ title: "{text}", description: "{key}", type: "Active" })
                    }
                });
                this._destinationPopover = new Popover({ showHeader: false, content: [this._destinationPopoverList], placement: "Bottom" });
                this._destinationPopoverList.attachItemPress(function (oEvt) {
                    var oItem = oEvt.getParameter('listItem'); if (!oItem) { return; }
                    var oCtx = oItem.getBindingContext(); var sKey = oCtx ? oCtx.getProperty('key') : null;
                    if (sKey) {
                        // set destination on single item model
                        var oItemModel = that.getView().getModel('item');
                        var oData = oItemModel.getData() || {};
                        oData.Destination = sKey;
                        oItemModel.setData(oData);
                        // After selecting destination, fetch required fields and open dynamic dialog
                        that.getOwnerComponent().getModel().read('/RequiredFieldsSet', {
                            filters: [new Filter('Destination', FilterOperator.EQ, sKey)],
                            success: function (oResult) {
                                var aFields = [];
                                if (oResult && oResult.results) {
                                    aFields = oResult.results.map(function (o) {
                                        return { field: o.Field_id || o.FieldId || o.Field || "", description: o.Description || "", table: o.Table || "", tableField: o.TableField || "", type: o.Type || "", length: o.Length || "" };
                                    });
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
                    var oListModel = new JSONModel({ items: aItems });
                    that._destinationPopoverList.setModel(oListModel);
                    that._destinationPopoverList.bindItems({ path: '/items', template: new StandardListItem({ title: '{text}', description: '{key}', type: 'Active' }) });
                    that._destinationPopover.openBy(oSource);
                },
                error: function () { that.showErrorMessage('No se pudieron obtener los destinos'); }
            });
        },

        /**
         * Value help for Object Type: reads /ObjectTypeSet and shows descriptions.
         * On selection, sets both ObjectDescription (visible) and TypeObj (hidden code) on the 'item' model.
         */
        onObjectTypeValueHelp: function (oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            this._objectTypeValueHelpSource = oSource;

            if (!this._objectTypePopover) {
                this._objectTypePopoverList = new List({
                    noDataText: "No hay tipos de objeto disponibles",
                    items: {
                        path: "/items",
                        template: new StandardListItem({ title: "{text}", description: "{key}", type: "Active" })
                    }
                });
                this._objectTypePopover = new Popover({ showHeader: false, content: [this._objectTypePopoverList], placement: "Bottom" });
                this._objectTypePopoverList.attachItemPress(function (oEvt) {
                    var oItem = oEvt.getParameter('listItem'); if (!oItem) { return; }
                    var oCtx = oItem.getBindingContext(); var sKey = oCtx ? oCtx.getProperty('key') : null; var sText = oCtx ? oCtx.getProperty('text') : null;
                    if (sKey) {
                        // set item model values: TypeObj (code) and ObjectDescription (description visible)
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
                    var oListModel = new JSONModel({ items: aItems });
                    that._objectTypePopoverList.setModel(oListModel);
                    that._objectTypePopoverList.bindItems({ path: '/items', template: new StandardListItem({ title: '{text}', description: '{key}', type: 'Active' }) });
                    that._objectTypePopover.openBy(oSource);
                },
                error: function () { that.showErrorMessage('No se pudieron obtener los tipos de objeto'); }
            });
        },

        // Delegated to BaseController: _openDynamicEditDialog, _showDynamicEditDialog

        // Delegated to BaseController: onDynamicEditDialogSave

        // Delegated to BaseController: onApplyValidatedUpdate

        // Delegated to BaseController: onDynamicEditDialogCancel

        /**
         * Handler para editar ObjKey: abrir diálogo dinámico con campos según Destination
         */
        onObjKeyLinkPress: function (oEvent) {
            var oCtx = null;
            var oSource = oEvent.getSource ? oEvent.getSource() : null;
            var oItem = this.getView().getModel('item').getData() || {};
            var sDestination = oItem.Destination;
            var that = this;
            if (!this._errorAllowsEdit || !sDestination) {
                // still allow if destination present
            }
            this.getOwnerComponent().getModel().read('/RequiredFieldsSet', {
                filters: [new Filter('Destination', FilterOperator.EQ, sDestination)],
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

        onExit: function () {
            if (this._sPdfBlobUrl && URL && URL.revokeObjectURL) { try { URL.revokeObjectURL(this._sPdfBlobUrl); } catch (e) { } }
        }
    });
});
