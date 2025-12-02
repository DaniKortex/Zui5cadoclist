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
         * Determine if Error value allows editing (contains 'P' or 'E')
         * @private
         */
        _errorAllowsEdit: function (vError) {
            if (vError === null || vError === undefined) { return false; }
            if (typeof vError !== 'string') { return false; }
            var s = vError.trim().toUpperCase();
            if (s === '') { return false; }
            if (s.indexOf('P') !== -1) { return true; }
            if (s.indexOf('E') !== -1) { return true; }
            return false;
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
                    // store a deep copy of original values so Cancel can restore them
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
                                // set html content into control
                                try {
                                    var oHtml = that.byId('idPdfHtml');
                                    if (oHtml && oHtml.setContent) {
                                        var sHtml = '<object data="' + that._sPdfBlobUrl + '" type="application/pdf" width="100%" height="800px">&lt;p&gt;Tu navegador no puede mostrar PDF.&lt;/p&gt;&lt;/object&gt;';
                                        oHtml.setContent(sHtml);
                                    }
                                } catch (e) { /* ignore */ }
                            }
                        }
                    } catch (e) { console.error(e); }
                },
                error: function () {
                    that.getView().setBusy(false);
                }
            });
        },

        onNavBack: function () {
            this.getRouter().navTo('RouteDocumentList');
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

        /**
         * Open dynamic edit dialog to fill required fields
         */
        _openDynamicEditDialog: function (oData, aFields) {
            var that = this;
            if (!this._dynamicEditDialog) {
                Fragment.load({ name: "zui5cadoclist.view.DynamicEditDialog", controller: this }).then(function (oDialog) {
                    that._dynamicEditDialog = oDialog;
                    that.getView().addDependent(oDialog);
                    that._showDynamicEditDialog(oDialog, oData, aFields);
                });
            } else {
                this._showDynamicEditDialog(this._dynamicEditDialog, oData, aFields);
            }
        },

        _showDynamicEditDialog: function (oDialog, oData, aFields) {
            var oVBox = oDialog.getContent()[0];
            if (oVBox.destroyItems) { oVBox.destroyItems(); } else { oVBox.removeAllItems(); }
            var oModelData = Object.assign({}, oData);
            this._sDestination = oModelData.Destination || "";
            oModelData.requiredFields = {};
            oModelData._fieldMap = [];
            var fnSafeKey = function (s) { if (!s || typeof s !== 'string') { return null; } return s.replace(/[^a-zA-Z0-9]/g, '_'); };
            aFields.forEach(function (oField, idx) {
                var sLabel = (oField.description && oField.description.trim() !== "") ? oField.description : (oField.field || ("Campo " + (idx + 1)));
                var sOrig = oField.field || ("f" + idx);
                var sKey = fnSafeKey(sOrig) || ("f" + idx);
                if (oModelData._fieldMap.some(function (m) { return m.key === sKey; })) { sKey = sKey + "_" + idx; }
                oModelData._fieldMap.push({ key: sKey, original: sOrig, table: oField.table || "", tableField: oField.tableField || "", type: oField.type || "", description: oField.description || "", length: oField.length || "" });
                oModelData.requiredFields[sKey] = oData && oData[sOrig] ? oData[sOrig] : "";
                var sInputId = (oDialog.createId) ? oDialog.createId("input_" + sKey) : (oDialog.getId() + "--input_" + sKey);
                oVBox.addItem(new sap.m.Label({ text: sLabel, labelFor: sInputId }));
                oVBox.addItem(new sap.m.Input({ id: sInputId, value: '{editDynamic>/requiredFields/' + sKey + '}' }));
            });
            var oEditModel = new JSONModel(oModelData);
            oDialog.setModel(oEditModel, "editDynamic");
            oDialog.open();
        },

        onDynamicEditDialogSave: function () {
            var oDialog = this._dynamicEditDialog;
            if (!oDialog) { return; }
            var oEditModel = oDialog.getModel("editDynamic");
            if (!oEditModel) { this.showErrorMessage("No hay datos para guardar"); return; }
            var oDataModel = oEditModel.getData();
            var aChildren = [];
            if (oDataModel._fieldMap && Array.isArray(oDataModel._fieldMap)) {
                oDataModel._fieldMap.forEach(function (m) {
                    var value = (oDataModel.requiredFields && (m.key in oDataModel.requiredFields)) ? oDataModel.requiredFields[m.key] : "";
                    var sValue = (value != null && String(value).trim() !== "") ? String(value) : "SIN ASIGNAR";
                    aChildren.push({ Destination: this._sDestination || "", Field_id: m.original || "", Table: m.table || "", TableField: m.tableField || m.original || "", Type: m.type || "", Description: m.description || "", Length: m.length || ((sValue) ? String(sValue.length) : ""), InputValue: sValue });
                }.bind(this));
            }
            var oDeepPayload = { Destination: this._sDestination || "", NavRequiredFields: { results: aChildren } };
            var aMissingFieldId = aChildren.filter(function (c) { return !c.Field_id || String(c.Field_id).trim() === ""; });
            if (aMissingFieldId.length > 0) { this.showErrorMessage("Hay campos requeridos sin identificador (Field_id). Revisa la configuración."); return; }
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            oModel.create("/DestinationAssignSet", oDeepPayload, {
                success: function (oResponseData) {
                    try {
                        var oCurrent = oDialog.getModel("editDynamic").getData();
                        var aParts = [];
                        if (oCurrent._fieldMap && Array.isArray(oCurrent._fieldMap)) { oCurrent._fieldMap.forEach(function (m) { var val = (oCurrent.requiredFields && (m.key in oCurrent.requiredFields)) ? oCurrent.requiredFields[m.key] : ""; var sVal = (val != null && String(val).trim() !== "") ? String(val) : ""; aParts.push(sVal); }); }
                        var sObjKey = aParts.join("") || (oCurrent.ObjKey || "");
                        if (sObjKey.length > 70) { sObjKey = sObjKey.substring(0, 70); }
                        // prepare pending update in item model so user can review before applying
                        var oItemModel = that.getView().getModel('item');
                        var oItem = oItemModel.getData() || {};
                        // populate view inputs so user can review values before applying
                        oItem.ObjKey = sObjKey;
                        oItem.Destination = oCurrent.Destination || oItem.Destination;
                        oItem._pendingUpdate = { ObjKey: sObjKey, Destination: oItem.Destination };
                        oItem._validated = true;
                        oItemModel.setData(oItem);
                        // close dialog and inform user
                        try { oDialog.close(); } catch (e) { }
                        that.showSuccessMessage('Validación correcta. Revise los datos y pulse "Actualizar" para aplicar.');
                    } catch (e) {
                        that.showErrorMessage("Error preparando la actualización: " + (e.message || e));
                    }
                },
                error: function (oError) {
                    console.error("DestinationAssign create error:", oError);
                    var sRaw = oError && (oError.responseText || oError.response || oError.body || "");
                    var aErrors = null;
                    try {
                        var oParsed = typeof sRaw === 'string' ? JSON.parse(sRaw) : sRaw;
                        if (Array.isArray(oParsed)) { aErrors = oParsed; }
                        else if (oParsed && oParsed.error && oParsed.error.innererror && oParsed.error.innererror.errordetails) { aErrors = oParsed.error.innererror.errordetails; }
                        else if (oParsed && oParsed.error && oParsed.error.message) { aErrors = [{ message: oParsed.error.message }]; }
                    } catch (e) { }
                    if (aErrors && aErrors.length) {
                        aErrors.forEach(function (err) {
                            var sMsg = err.message || err.Message || (err.error && err.error.message) || "Error de validación";
                            var targets = err.targets || err.Targets || [];
                            if (!targets || targets.length === 0) { targets = err.target ? [err.target] : (err.Target ? [err.Target] : []); }
                            targets.forEach(function (t) {
                                var sField = String(t).replace(/^.*\//, '').replace(/[^A-Za-z0-9_]/g, '');
                                if (oDataModel._fieldMap && Array.isArray(oDataModel._fieldMap)) {
                                    oDataModel._fieldMap.forEach(function (m) {
                                        if (m.original && m.original.toString().toLowerCase() === sField.toLowerCase()) {
                                            var sInputId = (oDialog.createId) ? oDialog.createId("input_" + m.key) : (oDialog.getId() + "--input_" + m.key);
                                            var oInput = sap.ui.getCore().byId(sInputId);
                                            if (oInput && oInput.setValueState) { oInput.setValueState(sap.ui.core.ValueState.Error); oInput.setValueStateText(sMsg); }
                                        }
                                    });
                                }
                            });
                        });
                        that.showErrorMessage("Validación fallida. Corrige los campos marcados.");
                    } else {
                        that.showErrorMessage("Error al validar los campos. Comprueba la consola para más detalles.");
                        var sShort = (typeof sRaw === 'string') ? sRaw.substring(0, 1000) : JSON.stringify(sRaw);
                        MessageBox.error("Error en validación: " + (sShort || "sin detalle"));
                    }
                }
            });
        },

        /**
         * Apply the pending validated update prepared by the dynamic dialog.
         */
        onApplyValidatedUpdate: function () {
            var oItemModel = this.getView().getModel('item');
            var oItem = oItemModel.getData() || {};
            if (!oItem._validated || !oItem._pendingUpdate) {
                this.showMessage('No hay cambios validados para aplicar.');
                return;
            }
            // Merge pending values into item and persist via onSave
            oItem.ObjKey = oItem._pendingUpdate.ObjKey || oItem.ObjKey;
            oItem.Destination = oItem._pendingUpdate.Destination || oItem.Destination;
            // clear pending flags BEFORE saving to avoid race if save fails
            delete oItem._pendingUpdate;
            oItem._validated = false;
            oItemModel.setData(oItem);
            // Call onSave to persist
            this.onSave();
        },

        /**
         * Cancel: restore original item values loaded when view was opened.
         */
        onCancel: function () {
            var oModel = this.getView().getModel('item');
            if (!oModel) { return; }
            if (this._originalItem) {
                try {
                    // restore deep copy
                    var oRestored = JSON.parse(JSON.stringify(this._originalItem));
                    oModel.setData(oRestored);
                    this.showMessage('Valores restaurados');
                } catch (e) {
                    oModel.setData(this._originalItem);
                    this.showMessage('Valores restaurados');
                }
            } else {
                this.showMessage('No hay valores originales disponibles para restaurar');
            }
        },

        onDynamicEditDialogCancel: function () {
            if (this._dynamicEditDialog) { this._dynamicEditDialog.close(); this._dynamicEditDialog.destroy(); this._dynamicEditDialog = null; }
        },

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
