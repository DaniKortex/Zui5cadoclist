sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/core/UIComponent",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/Popover",
    "sap/m/List",
    "sap/m/StandardListItem",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, History, UIComponent, MessageToast, MessageBox, JSONModel, Fragment, Popover, List, StandardListItem, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("zui5cadoclist.controller.BaseController", {

        /**
         * Convenience method for accessing the router in every controller of the application.
         * @public
         * @returns {sap.ui.core.routing.Router} the router for this component
         */
        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },

        /**
         * Convenience method for getting the view model by name in every controller of the application.
         * @public
         * @param {string} sName the model name
         * @returns {sap.ui.model.Model} the model instance
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        /**
         * Convenience method for setting the view model in every controller of the application.
         * @public
         * @param {sap.ui.model.Model} oModel the model instance
         * @param {string} sName the model name
         * @returns {sap.ui.mvc.View} the view instance
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        /**
         * Convenience method for getting the resource bundle.
         * @public
         * @returns {sap.base.i18n.ResourceBundle} the resourceModel of the component
         */
        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        /**
         * Method for navigation to specific section
         * @public
         * @param {string} psTarget Parameter containing the string for the target navigation
         * @param {Object} pmParameters? Parameters for navigation
         * @param {boolean} pbReplace? Defines if the hash should be replaced (no browser history entry) or set (browser history entry)
         */
        navTo: function (psTarget, pmParameters, pbReplace) {
            this.getRouter().navTo(psTarget, pmParameters, pbReplace);
        },

        /**
         * Method to go back to previous page or to specific route
         * @public
         * @param {string} psRoute? Specific route to go back to 
         */
        onNavBack: function (psRoute) {
            var sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined || psRoute) {
                if (psRoute) {
                    this.getRouter().navTo(psRoute, {}, true /*no history*/);
                } else {
                    history.go(-1);
                }
            } else {
                this.getRouter().navTo("RouteDocumentList", {}, true /*no history*/);
            }
        },

        /**
         * Shows a MessageToast with the given text
         * @public
         * @param {string} sMessage message to be displayed
         */
        showMessage: function (sMessage) {
            MessageToast.show(sMessage);
        },

        /**
         * Shows a MessageBox.error with the given text
         * @public
         * @param {string} sMessage error message to be displayed
         */
        showErrorMessage: function (sMessage) {
            MessageBox.error(sMessage);
        },

        /**
         * Shows a MessageBox.success with the given text
         * @public
         * @param {string} sMessage success message to be displayed
         */
        showSuccessMessage: function (sMessage) {
            MessageBox.success(sMessage);
        },

        /**
         * Shows a MessageBox.confirm with the given text and actions
         * @public
         * @param {string} sMessage confirmation message to be displayed
         * @param {function} fnOnConfirm callback function when confirmed
         * @param {function} fnOnCancel? callback function when cancelled (optional)
         */
        showConfirmMessage: function (sMessage, fnOnConfirm, fnOnCancel) {
            MessageBox.confirm(sMessage, {
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK && fnOnConfirm) {
                        fnOnConfirm();
                    } else if (oAction === MessageBox.Action.CANCEL && fnOnCancel) {
                        fnOnCancel();
                    }
                }
            });
        },

        /**
         * Method to format boolean values for display
         * @public
         * @param {boolean} bValue boolean value to format
         * @returns {string} formatted text
         */
        formatBoolean: function (bValue) {
            var oResourceBundle = this.getResourceBundle();
            if (bValue === true) {
                return oResourceBundle.getText("yes");
            } else if (bValue === false) {
                return oResourceBundle.getText("no");
            }
            return "";
        },

        /**
         * Method to format date values for display
         * @public
         * @param {Date} dValue date value to format
         * @returns {string} formatted date
         */
        formatDate: function (dValue) {
            if (dValue) {
                var oDateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
                    pattern: "dd.MM.yyyy HH:mm:ss"
                });
                return oDateFormat.format(new Date(dValue));
            }
            return "";
        },

        /**
         * Event handler when a table search is triggered
         * @public
         * @param {sap.ui.base.Event} oEvent the search event
         */
        onSearch: function (oEvent) {
            var sQuery = oEvent.getSource().getValue();
            var oTable = this.byId("documentsTable");
            var oBinding = oTable.getBinding("items");

            if (sQuery && sQuery.length > 0) {
                var aFilters = [
                    new sap.ui.model.Filter("FileName", sap.ui.model.FilterOperator.Contains, sQuery),
                    new sap.ui.model.Filter("ObjectDescription", sap.ui.model.FilterOperator.Contains, sQuery),
                    new sap.ui.model.Filter("Username", sap.ui.model.FilterOperator.Contains, sQuery),
                    new sap.ui.model.Filter("DocId", sap.ui.model.FilterOperator.Contains, sQuery)
                ];
                var oFilter = new sap.ui.model.Filter(aFilters, false);
                oBinding.filter([oFilter]);
            } else {
                oBinding.filter([]);
            }
        },

        /**
         * Method to refresh the data in the model
         * @public
         */
        refreshData: function () {
            this.getModel("").refresh();
        },

        // onDestinationValueHelp intentionally not in BaseController per user request

        // onObjectTypeValueHelp intentionally not in BaseController per user request

        /**
         * Open dynamic edit dialog to fill required fields.
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
                        var oEditDynModel = oDialog.getModel("editDynamic");
                        var oCurrent = oEditDynModel.getData();
                        // Map server-provided InputValue back into requiredFields using Field_id
                        if (oResponseData && oResponseData.NavRequiredFields && oResponseData.NavRequiredFields.results && Array.isArray(oResponseData.NavRequiredFields.results)) {
                            var aServerFields = oResponseData.NavRequiredFields.results;
                            // Build lookup by Field_id
                            var mServerByFieldId = {};
                            aServerFields.forEach(function (f) {
                                var sFid = f.Field_id || f.FieldId || f.Field || "";
                                if (sFid) { mServerByFieldId[String(sFid).toLowerCase()] = f.InputValue || ""; }
                            });
                            // Apply to requiredFields via _fieldMap original names
                            if (oCurrent._fieldMap && Array.isArray(oCurrent._fieldMap)) {
                                oCurrent._fieldMap.forEach(function (m) {
                                    var sOrig = m.original || "";
                                    var sSrvVal = sOrig ? mServerByFieldId[String(sOrig).toLowerCase()] : undefined;
                                    if (sSrvVal !== undefined) {
                                        if (!oCurrent.requiredFields) { oCurrent.requiredFields = {}; }
                                        oCurrent.requiredFields[m.key] = sSrvVal;
                                    }
                                });
                            }
                            // Update the editDynamic model so UI reflects mapped values
                            oEditDynModel.setData(oCurrent);
                        }
                        // Build ObjKey from mapped requiredFields
                        var aParts = [];
                        if (oCurrent._fieldMap && Array.isArray(oCurrent._fieldMap)) {
                            oCurrent._fieldMap.forEach(function (m) {
                                var val = (oCurrent.requiredFields && (m.key in oCurrent.requiredFields)) ? oCurrent.requiredFields[m.key] : "";
                                var sVal = (val != null && String(val).trim() !== "") ? String(val) : "";
                                aParts.push(sVal);
                            });
                        }
                        var sObjKey = aParts.join("") || (oCurrent.ObjKey || "");
                        if (sObjKey.length > 70) { sObjKey = sObjKey.substring(0, 70); }
                        var oItemModel = that.getView().getModel('item');
                        var oItem = oItemModel.getData() || {};
                        oItem.ObjKey = sObjKey;
                        // Para pantallas que quieren mostrar la descripción (p.ej. DocumentItemEdit, AddAttachments),
                        // si hemos guardado _destinationText en el modelo, úsalo como Destination final tras validar.
                        var sControllerName = that.getMetadata && that.getMetadata().getName && that.getMetadata().getName();
                        if ((sControllerName === "zui5cadoclist.controller.DocumentItemEdit" || sControllerName === "zui5cadoclist.controller.AddAttachments") && oItem._destinationText) {
                            oItem.Destination = oItem._destinationText;
                        } else {
                            // Comportamiento estándar: preferir Destination devuelto por el backend si existe
                            oItem.Destination = (oResponseData && oResponseData.Destination) ? oResponseData.Destination : (oCurrent.Destination || oItem.Destination);
                        }
                        oItem._pendingUpdate = { ObjKey: sObjKey, Destination: oItem.Destination };
                        oItem._validated = true;
                        oItemModel.setData(oItem);
                        try { oDialog.close(); } catch (e) { }
                        that.showSuccessMessage('Validación correcta');
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
            oItem.ObjKey = oItem._pendingUpdate.ObjKey || oItem.ObjKey;
            oItem.Destination = oItem._pendingUpdate.Destination || oItem.Destination;
            delete oItem._pendingUpdate;
            oItem._validated = false;
            oItemModel.setData(oItem);
            if (this.onSave) { this.onSave(); }
        },

        onDynamicEditDialogCancel: function () {
            if (this._dynamicEditDialog) { this._dynamicEditDialog.close(); this._dynamicEditDialog.destroy(); this._dynamicEditDialog = null; }
        }

    });

});