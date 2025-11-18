
sap.ui.define([
    "zui5cadoclist/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/ui/core/Fragment",
    "sap/m/Popover",
    "sap/m/List",
    "sap/m/StandardListItem",
    "sap/m/MessageBox"
],
function (BaseController, JSONModel, Filter, FilterOperator, Sorter, Fragment, Popover, List, StandardListItem, MessageBox) {
    "use strict";

    return BaseController.extend("zui5cadoclist.controller.DocumentList", {
       
        /**
         * Formatter para el campo Status basado en el campo Error:
         * - Si Error contiene 'P' -> 'Pendiente'
         * - Si Error contiene 'E' -> 'Error'
         * - Si Error está vacío -> 'OK'
         * La comprobación es case-insensitive y acepta cualquier representación que contenga las letras indicadas.
         */
        formatStatusText: function(vError) {
            // The backend uses only three possible values for Error: 'E', 'P' or empty.
            // Map them explicitly: 'P' -> 'Pendiente', 'E' -> 'Error', empty/null -> 'OK'.
            try {
                if (vError === null || vError === undefined) { return 'OK'; }
                var s = String(vError).trim();
                if (s === '') { return 'OK'; }
                var sUpper = s.toUpperCase();
                if (sUpper.indexOf('P') !== -1) { return 'Pendiente'; }
                if (sUpper.indexOf('E') !== -1) { return 'Error'; }
                return 'OK';
            } catch (e) {
                return 'OK';
            }
        },

        /**
         * Formatter para mostrar el texto de Destino. Si está vacío, mostrar 'Indicar destino'
         */
        formatDestinationText: function(v) {
            if (v && typeof v === 'string' && v.trim() !== '') {
                return v;
            }
            return 'Indicar destino';
        },

        /**
         * Decide si el campo Destination debe ser editable según el valor de Error ('P'/'E').
         * Devuelve boolean: true si se permite editar (Error = 'P' o 'E'), false en caso contrario.
         */
        formatDestinationEditable: function(vError) {
            return this._errorAllowsEdit(vError);
        },
        
        onInit: function () {
            console.log("DocumentList Controller - onInit called");
            
            // Initialize view model for UI state
            var oViewModel = new JSONModel({
                busy: false,
                delay: 0,
                itemCount: 0,
                sortOrderDocId: undefined,
                sortOrderModifiedAt: undefined,
                hasSelection: false,
                selectedItem: null,
                onlyErrors: false,
                onlyPending: false
            });
            this.setModel(oViewModel, "viewModel");

            // Check if model is available
            var oModel = this.getModel();
            console.log("OData Model available: ", !!oModel);
            
            if (oModel) {
                console.log("Model service URL: ", oModel.sServiceUrl);
                
                // Attach events to model for debugging
                oModel.attachRequestSent(function() {
                    console.log("OData request sent");
                });
                
                oModel.attachRequestCompleted(function() {
                    console.log("OData request completed");
                });
                
                oModel.attachRequestFailed(function(oEvent) {
                    console.error("OData request failed: ", oEvent.getParameters());
                });
            }

            // Try to read data directly to test connection
            this._testDataConnection();

            // Wire SmartFilterBar search event
            var oSFB = this.byId("idSmartFilterBar");
            if (oSFB) {
                oSFB.attachSearch(this.onSmartFilterBarSearch, this);
            }
        },

        /**
         * After rendering: remove internal table scrollbar by expanding visibleRowCount
         * to the number of results, and compute sticky header offset so headers stay
         * visible when the DynamicPage scrolls.
         */
        onAfterRendering: function () {
            try {
                var oTable = this.byId("idDocumentsTable");
                if (!oTable) { return; }
                var oBinding = oTable.getBinding("rows");
                if (oBinding) {
                    // When data arrives, adjust visibleRowCount to at most 10 rows
                    // so the table shows a maximum of 10 visible rows and retains
                    // its internal scrollbar for additional rows.
                    oBinding.attachDataReceived(function (oEvt) {
                        var iCount = 0;
                        var oData = oEvt.getParameter && oEvt.getParameter('data');
                        if (oData && Array.isArray(oData.results)) {
                            iCount = oData.results.length;
                        } else if (oBinding.getLength) {
                            iCount = oBinding.getLength();
                        }
                        if (iCount && iCount > 0) {
                            try {
                                var iMax = 10;
                                var iVisible = (iCount <= iMax) ? iCount : iMax;
                                oTable.setVisibleRowCount(iVisible);
                            } catch (e) { /* ignore */ }
                        }
                        // After rows are set, recompute sticky header top offset
                        this._updateStickyHeaderTop();
                    }.bind(this));
                }

                // Initial compute for header offset and attach resize handler
                this._updateStickyHeaderTop();
                if (!this._fnStickyResize) {
                    this._fnStickyResize = this._updateStickyHeaderTop.bind(this);
                    window.addEventListener('resize', this._fnStickyResize);
                }
            } catch (e) { /* silent */ }
        },

        /**
         * Test data connection
         * @private
         */
        _testDataConnection: function() {
            var oModel = this.getModel();
            if (oModel) {
                console.log("Testing data connection...");
                oModel.read("/PdfListSet", {
                    success: function(oData) {
                        console.log("Success reading PdfListSet: ", oData);
                        console.log("Number of records: ", oData.results ? oData.results.length : 0);
                    },
                    error: function(oError) {
                        console.error("Error reading PdfListSet: ", oError);
                    }
                });
            }
        },

        /**
         * Compute and apply the DynamicPage header height as CSS variable for the table
         * so CSS can position the sticky header correctly.
         * @private
         */
        _updateStickyHeaderTop: function() {
            try {
                var oTable = this.byId("idDocumentsTable");
                if (!oTable) { return; }
                var oDP = this.byId("idDocumentListDynamicPage");
                var iTop = 0;
                if (oDP && oDP.getDomRef) {
                    var oDom = oDP.getDomRef();
                    if (oDom) {
                        // Prefer title wrapper, else header
                        var elTitle = oDom.querySelector('.sapFDynamicPageTitleWrapper') || oDom.querySelector('.sapFDynamicPageTitle');
                        var elHeader = oDom.querySelector('.sapFDynamicPageHeader');
                        if (elTitle) { iTop += Math.ceil(elTitle.getBoundingClientRect().height); }
                        if (elHeader) { iTop += Math.ceil(elHeader.getBoundingClientRect().height); }
                        if (iTop === 0) {
                            var hdr = oDom.querySelector('.sapFDynamicPageHeader') || oDom.querySelector('.sapFPageHeader') || oDom.querySelector('.sapFDynamicPageTitle');
                            if (hdr) { iTop = Math.ceil(hdr.getBoundingClientRect().height); }
                        }
                    }
                }
                var tDom = oTable.getDomRef();
                if (tDom && tDom.style) { tDom.style.setProperty('--table-header-top', iTop + 'px'); }
            } catch (e) { /* ignore */ }
        },

        /**
         * Cleanup on exit: remove window resize handler if attached.
         */
        onExit: function() {
            if (this._fnStickyResize) {
                try { window.removeEventListener('resize', this._fnStickyResize); } catch (e) { /* ignore */ }
                this._fnStickyResize = null;
            }
        },

        /**
         * Event handler for refresh button
         * @public
         */
        onRefresh: function () {
            console.log("Refresh button clicked");
            var oTable = this.byId("idDocumentsTable");
            if (oTable && oTable.getBinding("rows")) {
                oTable.getBinding("rows").refresh();
                // Clear any existing sorting
                var oViewModel = this.getModel("viewModel");
                oViewModel.setProperty("/sortOrderDocId", undefined);
                oViewModel.setProperty("/sortOrderModifiedAt", undefined);
            }
            this._testDataConnection();
        },

        /**
         * Debug method to check table state
         * @private
         */
        _debugTableState: function() {
            var oTable = this.byId("idDocumentsTable");
            console.log("=== TABLE DEBUG INFO ===");
            console.log("Table found: ", !!oTable);
            if (oTable) {
                var oBinding = oTable.getBinding("rows");
                console.log("Binding found: ", !!oBinding);
                if (oBinding) {
                    console.log("Binding path: ", oBinding.getPath());
                    console.log("Binding length: ", oBinding.getLength());
                    console.log("Current sorters: ", oBinding.aSorters);
                }
                console.log("Visible row count: ", oTable.getVisibleRowCount());
            }
            console.log("=== END DEBUG INFO ===");
        },

        // onItemPress removed: sap.ui.table.Table uses row selection instead

        /**
         * Formatter para mostrar el icono de edición si hay Error o si está Pendiente (ObjKey vacío)
         */
        formatEditVisible: function (vError, vObjKey, vDestination) {
            // Allow edit only when Error contains 'P' or 'E' AND a Destination is assigned
            var bErrorAllowed = this._errorAllowsEdit(vError);
            var bHasDestination = (typeof vDestination === 'string' && vDestination.trim() !== '');
            return !!(bErrorAllowed && bHasDestination);
        },

        /**
         * Check if the Error field explicitly allows editing: contains 'P' (Pendiente) or 'E' (Error)
         * Accepts booleans/number/string representations; returns boolean.
         */
        _errorAllowsEdit: function(vError) {
            // Only accept the exact expected set: 'P', 'E' or empty. Treat non-string as empty.
            if (vError === null || vError === undefined) { return false; }
            if (typeof vError !== 'string') { return false; }
            var s = vError.trim().toUpperCase();
            if (s === '') { return false; }
            if (s.indexOf('P') !== -1) { return true; }
            if (s.indexOf('E') !== -1) { return true; }
            return false;
        },

        /**
         * Handler para el botón de edición: abre el diálogo de edición con los datos de la línea
         */
        onEditDocument: function(oEvent) {
            var oSource = oEvent.getSource();
            var oCtx = oSource.getBindingContext();
            var oData = oCtx.getObject();
            var that = this;

            // Cargar fragmento si no está cargado
            if (!this._editDialog) {
                Fragment.load({
                    name: "zui5cadoclist.view.EditDialog",
                    controller: this
                }).then(function(oDialog) {
                    that._editDialog = oDialog;
                    that.getView().addDependent(oDialog);
                    that._openEditDialog(oData);
                });
            } else {
                this._openEditDialog(oData);
            }
        },

        /**
         * Abrir diálogo para indicar nuevo destino al pulsar en el link de Destino
         */
        onDestinationPress: function(oEvent) {
            var oCtx = oEvent.getSource().getBindingContext();
            var oRowData = oCtx ? oCtx.getObject() : {};
            // Guardar la fila actual para usarla en el confirm del diálogo
            this._destinationRow = oRowData;
            // Permitir edición sólo si el campo Error contiene 'P' o 'E'
            var bAllowEdit = this._errorAllowsEdit(oRowData.Error);
            if (!bAllowEdit) {
                this.showMessage("Solo se puede editar si la línea contiene 'P' (Pendiente) o 'E' (Error) en la columna Error.");
                return;
            }
            var sCurrentDest = oRowData && oRowData.Destination ? oRowData.Destination : "";
            this._openDestinationDialog(sCurrentDest);
        },

        _openDestinationDialog: function(sCurrentDest) {
            var that = this;
            if (!this._destinationDialog) {
                Fragment.load({
                    name: "zui5cadoclist.view.DestinationDialog",
                    controller: this
                }).then(function(oDialog){
                    that._destinationDialog = oDialog;
                    that.getView().addDependent(oDialog);
                    var oModel = new JSONModel({ newDestination: sCurrentDest });
                    oDialog.setModel(oModel, "destination");
                    oDialog.open();
                });
            } else {
                var oModel = this._destinationDialog.getModel("destination");
                if (!oModel) {
                    oModel = new JSONModel({ newDestination: sCurrentDest });
                    this._destinationDialog.setModel(oModel, "destination");
                } else {
                    oModel.setProperty("/newDestination", sCurrentDest);
                }
                this._destinationDialog.open();
            }
        },

        onDestinationValueHelp: function(oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            // If the value-help was triggered from a table row, only allow it when Error contains 'P' or 'E'
            var oRowCtx = oSource.getBindingContext();
            if (oRowCtx) {
                var oRowObj = oRowCtx.getObject();
                if (!this._errorAllowsEdit(oRowObj && oRowObj.Error)) {
                    this.showMessage("Solo se puede seleccionar destino si la línea contiene 'P' (Pendiente) o 'E' (Error) en la columna Error.");
                    return;
                }
            }
            this._destinationValueHelpSource = oSource;

            if (!this._destinationPopover) {
                this._destinationPopoverList = new List({
                    noDataText: "No hay destinos disponibles",
                    items: {
                        path: "/items",
                        template: new StandardListItem({ title: "{text}", description: "{key}", type: "Active" })
                    }
                });

                this._destinationPopover = new Popover({ showHeader: false, content: [ this._destinationPopoverList ], placement: "Bottom" });

                this._destinationPopoverList.attachItemPress(function(oEvt) {
                    var oItem = oEvt.getParameter('listItem'); if (!oItem) { return; }
                    var oCtx = oItem.getBindingContext(); var sKey = oCtx ? oCtx.getProperty('key') : null;
                    var oTrigger = that._destinationValueHelpSource;
                    if (sKey && oTrigger) {
                        var oDestModel = (that._destinationDialog && that._destinationDialog.getModel('destination')) || oTrigger.getModel('destination');
                        if (oDestModel) {
                            oDestModel.setProperty('/newDestination', sKey);
                        } else {
                            var oCtxRow = oTrigger.getBindingContext();
                            if (oCtxRow) {
                                try { oCtxRow.getModel().setProperty(oCtxRow.getPath() + '/Destination', sKey); } catch (e) { var oRowObj = oCtxRow.getObject(); if (oRowObj) { oRowObj.Destination = sKey; } }
                                var oRowData = oCtxRow.getObject();
                                that.getModel().read('/RequiredFieldsSet', {
                                    filters: [ new Filter('Destination', FilterOperator.EQ, sKey) ],
                                    success: function(oResult) {
                                        var aFields = [];
                                        if (oResult && oResult.results) {
                                            aFields = oResult.results.map(function(o){
                                                return { field: o.Field_id || o.FieldId || o.Field || '', description: o.Description || '', table: o.Table || '', tableField: o.TableField || '', type: o.Type || '', length: o.Length || '' };
                                            });
                                        }
                                        that._openDynamicEditDialog(oRowData, aFields);
                                    },
                                    error: function() { that.showErrorMessage('No se pudieron obtener los campos requeridos para el destino seleccionado'); }
                                });
                            }
                        }
                    }
                    that._destinationPopover.close();
                });
            }

            var oModel = this.getModel();
            oModel.read('/DestinationAssignSet', {
                success: function(oData) {
                    var a = oData && oData.results ? oData.results : [];
                    var aItems = a.map(function(o){ return { key: o.Destination || o.Key || o.Id || o.Name || '', text: o.Description || o.Destination || o.Name || o.Key || '' }; });
                    var oListModel = new JSONModel({ items: aItems });
                    that._destinationPopoverList.setModel(oListModel);
                    that._destinationPopoverList.bindItems({ path: '/items', template: new StandardListItem({ title: '{text}', description: '{key}', type: 'Active' }) });
                    that._destinationPopover.openBy(oSource);
                },
                error: function() { that.showErrorMessage('No se pudieron obtener los destinos'); }
            });
        },

        /**
         * Handler para click en Clave Objeto: abre diálogo dinámico según requiredFields
         */
        onObjKeyLinkPress: function(oEvent) {
            var oSource = oEvent.getSource();
            var oCtx = oSource.getBindingContext();
            var oData = oCtx.getObject();
            var that = this;
            // Permitir edición sólo si el campo Error contiene 'P' o 'E'
            var bAllowEdit = this._errorAllowsEdit(oData.Error);
            if (!bAllowEdit) {
                this.showMessage("Solo se puede editar si la línea contiene 'P' (Pendiente) o 'E' (Error) en la columna Error.");
                return;
            }
            var sDestination = oData.Destination;
            var oModel = this.getModel();
            // Llamada OData para obtener los campos requeridos según el destino
            oModel.read("/RequiredFieldsSet", {
                filters: [new sap.ui.model.Filter("Destination", sap.ui.model.FilterOperator.EQ, sDestination)],
                success: function(oResult) {
                    var aFields = [];
                    if (oResult && oResult.results) {
                        // Map server properties exactly (metadata: Field_id, Table, TableField, Type, Description, Length)
                        aFields = oResult.results.map(function(o){
                            return {
                                field: o.Field_id || o.FieldId || o.Field || "",
                                description: o.Description || "",
                                table: o.Table || "",
                                tableField: o.TableField || "",
                                type: o.Type || "",
                                length: o.Length || ""
                            };
                        });
                    }
                    that._openDynamicEditDialog(oData, aFields);
                },
                error: function() {
                    that.showErrorMessage("No se pudieron obtener los campos requeridos para el destino seleccionado");
                }
            });
        },

        /**
         * Abre el diálogo dinámico con inputs según requiredFields
         */
        _openDynamicEditDialog: function(oData, aFields) {
            var that = this;
            if (!this._dynamicEditDialog) {
                Fragment.load({
                    name: "zui5cadoclist.view.DynamicEditDialog",
                    controller: this
                }).then(function(oDialog) {
                    that._dynamicEditDialog = oDialog;
                    that.getView().addDependent(oDialog);
                    that._showDynamicEditDialog(oDialog, oData, aFields);
                });
            } else {
                this._showDynamicEditDialog(this._dynamicEditDialog, oData, aFields);
            }
        },

        /**
         * Muestra el diálogo y genera los inputs dinámicamente
         */
        _showDynamicEditDialog: function(oDialog, oData, aFields) {
            // Preparamos un JSONModel para mantener los valores introducidos por el usuario
            // y una pequeña tabla de mapeo para poder 'aplanar' los valores al guardar.
            var oVBox = oDialog.getContent()[0];
            // Destroy existing items to avoid duplicate control IDs when reopening
            if (oVBox.destroyItems) {
                oVBox.destroyItems();
            } else {
                oVBox.removeAllItems();
            }

            // Construir estructura del modelo: copiar oData y preparar espacio para los campos requeridos
            var oModelData = Object.assign({}, oData);
            // store destination for deep-entity validation
            this._sDestination = oModelData.Destination || "";
            oModelData.requiredFields = {};
            oModelData._fieldMap = []; // [{ key: 'f0', original: 'FIELDNAME' }, ...]

            // Helper para generar claves seguras para propiedades del modelo
            var fnSafeKey = function(s) {
                if (!s || typeof s !== 'string') { return null; }
                // Reemplazar caracteres no alfanuméricos por underscore
                return s.replace(/[^a-zA-Z0-9]/g, '_');
            };

            aFields.forEach(function(oField, idx) {
                var sLabel = (oField.description && oField.description.trim() !== "") ? oField.description : (oField.field || ("Campo " + (idx+1)));
                // Use field name as property when posible, else fallback to f{idx}
                var sOrig = oField.field || ("f" + idx);
                var sKey = fnSafeKey(sOrig) || ("f" + idx);
                // Garantizar unicidad
                if (oModelData._fieldMap.some(function(m){ return m.key === sKey; })) {
                    sKey = sKey + "_" + idx;
                }
                oModelData._fieldMap.push({ key: sKey, original: sOrig, table: oField.table || "", tableField: oField.tableField || "", type: oField.type || "", description: oField.description || "", length: oField.length || "" });
                // Inicializar valor (si ya existe en oData, usarlo)
                oModelData.requiredFields[sKey] = oData && oData[sOrig] ? oData[sOrig] : "";

                // Use fragment-scoped id to avoid global collisions and ensure labelFor matches
                var sInputId = (oDialog.createId) ? oDialog.createId("input_" + sKey) : (oDialog.getId() + "--input_" + sKey);
                oVBox.addItem(new sap.m.Label({ text: sLabel, labelFor: sInputId }));
                oVBox.addItem(new sap.m.Input({ id: sInputId, value: '{editDynamic>/requiredFields/' + sKey + '}' }));
            });

            // Set model on dialog so onDynamicEditDialogSave pueda leerlo
            var oEditModel = new JSONModel(oModelData);
            oDialog.setModel(oEditModel, "editDynamic");
            oDialog.open();
        },

        /**
         * Guardar cambios del diálogo dinámico
         */
        onDynamicEditDialogSave: function() {
            var oDialog = this._dynamicEditDialog;
            if (!oDialog) { return; }
            var oEditModel = oDialog.getModel("editDynamic");
            if (!oEditModel) {
                this.showErrorMessage("No hay datos para guardar");
                return;
            }
            var oDataModel = oEditModel.getData();
            // Build aChildren array for deep-entity validation (one object per required field)
            var aChildren = [];
            if (oDataModel._fieldMap && Array.isArray(oDataModel._fieldMap)) {
                oDataModel._fieldMap.forEach(function(m) {
                    var value = (oDataModel.requiredFields && (m.key in oDataModel.requiredFields)) ? oDataModel.requiredFields[m.key] : "";
                    var sValue = (value != null && String(value).trim() !== "") ? String(value) : "SIN ASIGNAR";
                    aChildren.push({
                        Destination: this._sDestination || "",
                        Field_id: m.original || "",
                        Table: m.table || "",
                        TableField: m.tableField || m.original || "",
                        Type: m.type || "",
                        Description: m.description || "",
                        Length: m.length || ((sValue) ? String(sValue.length) : ""),
                        InputValue: sValue
                    });
                }.bind(this));
            }

            var oDeepPayload = {
                Destination: this._sDestination || "",
                NavRequiredFields: { results: aChildren }
            };

            // Debug: log payload to help diagnose transformation errors
            try {
                console.log("DestinationAssign deep payload:", JSON.stringify(oDeepPayload, null, 2));
            } catch (e) { /* ignore */ }

            // Basic validation before calling the service: ensure Field_id present in each child
            var aMissingFieldId = aChildren.filter(function(c){ return !c.Field_id || String(c.Field_id).trim() === ""; });
            if (aMissingFieldId.length > 0) {
                console.error("DestinationAssign validation aborted: missing Field_id for some required fields:", aMissingFieldId);
                // Inform user and stop
                this.showErrorMessage("Hay campos requeridos sin identificador (Field_id). Revisa la configuración de los campos requeridos para el destino.");
                return;
            }

            // Clear previous value states
            if (oDataModel._fieldMap && Array.isArray(oDataModel._fieldMap)) {
                oDataModel._fieldMap.forEach(function(m) {
                    var sInputId = (oDialog.createId) ? oDialog.createId("input_" + m.key) : (oDialog.getId() + "--input_" + m.key);
                    var oInput = sap.ui.getCore().byId(sInputId);
                    if (oInput && oInput.setValueState) {
                        oInput.setValueState(sap.ui.core.ValueState.None);
                        oInput.setValueStateText("");
                    }
                });
            }

            // Defensive: ensure we have a destination to validate against
            if (!this._sDestination || String(this._sDestination).trim() === "") {
                this.showErrorMessage("Destino no válido. Indica un destino antes de validar.");
                return;
            }

            // Call deep entity create on DestinationAssignSet for validation
            var oModel = this.getModel();
            var that = this;
            oModel.create("/DestinationAssignSet", oDeepPayload, {
                success: function(oResponseData) {
                    // En caso de éxito de validación, ofrecer opción de Actualizar o Cancelar
                    MessageBox.show("Validación correcta", {
                        title: "Validación",
                        actions: ["Actualizar", MessageBox.Action.CANCEL],
                        emphasizedAction: "Actualizar",
                        onClose: function(sAction) {
                            if (sAction === "Actualizar") {
                                try {
                                    // Reconstruir objeto para actualización en PdfListSet
                                    var oCurrent = oDialog.getModel("editDynamic").getData();
                                    // Construir ObjKey a partir de los valores introducidos (InputValue)
                                    var aParts = [];
                                    if (oCurrent._fieldMap && Array.isArray(oCurrent._fieldMap)) {
                                        oCurrent._fieldMap.forEach(function(m) {
                                            var val = (oCurrent.requiredFields && (m.key in oCurrent.requiredFields)) ? oCurrent.requiredFields[m.key] : "";
                                            var sVal = (val != null && String(val).trim() !== "") ? String(val) : "";
                                            aParts.push(sVal);
                                        });
                                    }
                                    var sObjKey = aParts.join("") || (oCurrent.ObjKey || "");
                                    // Truncar a 70 (metadata)
                                    if (sObjKey.length > 70) { sObjKey = sObjKey.substring(0,70); }

                                    // Preparar payload de actualización: tomar DocId y ObjKey (y Destination si procede)
                                    var oPayload = {
                                        DocId: oCurrent.DocId,
                                        ObjKey: sObjKey,
                                        Destination: oCurrent.Destination || undefined
                                    };
                                    // Llamar a la rutina central de update
                                    that._saveEntry(oPayload, oDialog);
                                } catch (e) {
                                    that.showErrorMessage("Error preparando la actualización: " + (e.message || e));
                                }
                            } else {
                                // Cancel: no hacer nada, solo cerrar el MessageBox (se cierra automáticamente)
                            }
                        }
                    });
                },
                error: function(oError) {
                    // Enhanced logging for debugging: log full OData error and responseText
                    console.error("DestinationAssign create error:", oError);
                    var sRaw = oError && (oError.responseText || oError.response || oError.body || "");
                    console.error("DestinationAssign responseText:", sRaw);
                    // Try to parse OData error details
                    var aErrors = null;
                    try {
                        var oParsed = typeof sRaw === 'string' ? JSON.parse(sRaw) : sRaw;
                        if (Array.isArray(oParsed)) { aErrors = oParsed; }
                        else if (oParsed && oParsed.error && oParsed.error.innererror && oParsed.error.innererror.errordetails) {
                            aErrors = oParsed.error.innererror.errordetails;
                        } else if (oParsed && oParsed.error && oParsed.error.message) {
                            aErrors = [{ message: oParsed.error.message }];
                        }
                    } catch (e) {
                        // non-json response; keep aErrors null
                    }

                    if (aErrors && aErrors.length) {
                        aErrors.forEach(function(err) {
                            var sMsg = err.message || err.Message || (err.error && err.error.message) || "Error de validación";
                            var targets = err.targets || err.Targets || [];
                            if (!targets || targets.length === 0) { targets = err.target ? [err.target] : (err.Target ? [err.Target] : []); }
                            targets.forEach(function(t) {
                                var sField = String(t).replace(/^.*\//, '').replace(/[^A-Za-z0-9_]/g, '');
                                // find matching field in _fieldMap
                                if (oDataModel._fieldMap && Array.isArray(oDataModel._fieldMap)) {
                                    oDataModel._fieldMap.forEach(function(m) {
                                        if (m.original && m.original.toString().toLowerCase() === sField.toLowerCase()) {
                                            var sInputId = (oDialog.createId) ? oDialog.createId("input_" + m.key) : (oDialog.getId() + "--input_" + m.key);
                                            var oInput = sap.ui.getCore().byId(sInputId);
                                            if (oInput && oInput.setValueState) {
                                                oInput.setValueState(sap.ui.core.ValueState.Error);
                                                oInput.setValueStateText(sMsg);
                                            }
                                        }
                                    });
                                }
                            });
                        });
                        that.showErrorMessage("Validación fallida. Corrige los campos marcados.");
                    } else {
                        // Mostrar detalle crudo en consola y notificar al usuario con mensaje resumido
                        that.showErrorMessage("Error al validar los campos. Comprueba la consola para más detalles.");
                        // También mostrar MessageBox con un fragmento del mensaje para depuración (no demasiado largo)
                        var sShort = (typeof sRaw === 'string') ? sRaw.substring(0,1000) : JSON.stringify(sRaw);
                        MessageBox.error("Error en validación: " + (sShort || "sin detalle"));
                    }
                }
            });
        },

        /**
         * Cancelar diálogo dinámico
         */
        onDynamicEditDialogCancel: function() {
            if (this._dynamicEditDialog) {
                this._dynamicEditDialog.close();
                this._dynamicEditDialog.destroy();
                this._dynamicEditDialog = null;
            }
        },

        /**
         * Abre el diálogo de edición y vincula los datos
         */
        _openEditDialog: function(oData) {
            // Usar un modelo JSON temporal para el diálogo
            var oEditModel = new JSONModel(Object.assign({}, oData));
            this._editDialog.setModel(oEditModel, "edit");
            this._editDialog.open();
        },

        /**
         * Handler para guardar los cambios del diálogo de edición
         */
        onEditDialogSave: function() {
            var oDialog = this._editDialog;
            var oEditModel = oDialog.getModel("edit");
            var oData = oEditModel.getData();
            // Reuse central update logic
            this._saveEntry(oData, oDialog);
        },

        /**
         * Centraliza la lógica de update en el backend para una entrada PdfListSet
         * @param {object} oData datos a enviar (debe contener DocId)
         * @param {sap.m.Dialog} oDialog diálogo que se cerrará en éxito
         */
        _saveEntry: function(oData, oDialog) {
            var oModel = this.getModel();
            var that = this;
            try {
                var sPath = oModel.createKey("/PdfListSet", { DocId: oData.DocId });
            } catch (e) {
                this.showErrorMessage("DocId inválido para actualización");
                return;
            }
            oModel.update(sPath, oData, {
                success: function() {
                    that.showSuccessMessage("Datos actualizados correctamente");
                    if (oDialog) { oDialog.close(); }
                    var oTable = that.byId("idDocumentsTable");
                    if (oTable && oTable.getBinding("rows")) {
                        oTable.getBinding("rows").refresh();
                    }
                },
                error: function(oError) {
                    that.showErrorMessage("Error al actualizar los datos");
                }
            });
        },

        /**
         * Handler para cancelar el diálogo de edición
         */
        onEditDialogCancel: function() {
            if (this._editDialog) {
                this._editDialog.close();
            }
        },

        /**
         * Event handler for visualize button
         * @public
         */
        onVisualizeDocument: function () {
            var oViewModel = this.getModel("viewModel");
            var oSelectedItem = oViewModel.getProperty("/selectedItem");
            
            if (!oSelectedItem) {
                this.showErrorMessage(this.getResourceBundle().getText("noDocumentSelected"));
                return;
            }
            
            if (!oSelectedItem.Pdf) {
                this.showErrorMessage(this.getResourceBundle().getText("noPdfAvailable"));
                return;
            }
            
            this._showPdfDialog(oSelectedItem);
        },

        /**
         * Event handler for row-level visualize button.
         * Opens the PDF dialog for the row that originated the press event (no selection required).
         * @param {sap.ui.base.Event} oEvent
         */
        onRowVisualizePress: function (oEvent) {
            var oSource = oEvent.getSource();
            if (!oSource) { return; }
            var oBindingContext = oSource.getBindingContext();
            if (!oBindingContext) {
                this.showErrorMessage(this.getResourceBundle().getText("noDocumentSelected"));
                return;
            }
            var oItem = oBindingContext.getObject();
            if (!oItem) {
                this.showErrorMessage(this.getResourceBundle().getText("noDocumentSelected"));
                return;
            }
            if (!oItem.Pdf) {
                this.showErrorMessage(this.getResourceBundle().getText("noPdfAvailable"));
                return;
            }
            // Reuse the existing PDF dialog opener
            this._showPdfDialog(oItem);
        },

        /**
         * Show PDF in dialog
         * @private
         * @param {object} oSelectedItem selected document item
         */
        _showPdfDialog: function (oSelectedItem) {
            var that = this;
            var fnOpen = function(oDialog){
                // Set the PDF data to the dialog model
                var oPdfModel = new JSONModel({
                    title: oSelectedItem.FileName,
                    docId: oSelectedItem.DocId,
                    pdfData: "data:application/pdf;base64," + oSelectedItem.Pdf
                });
                oDialog.setModel(oPdfModel, "pdf");
                oDialog.open();
            };

            if (!this._pdfDialog) {
                Fragment.load({
                    name: "zui5cadoclist.view.fragments.PdfViewer",
                    id: this.getView().getId(),
                    controller: this
                }).then(function(oDialog){
                    this._pdfDialog = oDialog;
                    this.getView().addDependent(this._pdfDialog);
                    fnOpen(this._pdfDialog);
                }.bind(this));
            } else {
                fnOpen(this._pdfDialog);
            }
        },

        /**
         * Close PDF dialog
         * @public
         */
        onClosePdfDialog: function () {
            if (this._pdfDialog) {
                this._pdfDialog.close();
            }
        },

        /**
         * Download PDF from dialog
         * @public
         */
        onDownloadPdfFromDialog: function () {
            var oPdfModel = this._pdfDialog.getModel("pdf");
            var oPdfData = oPdfModel.getData();
            
            if (oPdfData && oPdfData.pdfData) {
                // Create a download link
                var link = document.createElement('a');
                link.href = oPdfData.pdfData;
                link.download = oPdfData.title || 'document.pdf';
                link.click();
                
                this.showMessage(this.getResourceBundle().getText("downloadStarted", [oPdfData.docId]));
            }
        },
        onDownloadDocument: function (oEvent) {
            console.log("Download button clicked");
            var oBindingContext = oEvent.getSource().getBindingContext();
            if (oBindingContext) {
                var sDocId = oBindingContext.getProperty("DocId");
                var sPdf = oBindingContext.getProperty("Pdf");
                
                if (sPdf) {
                    this.showMessage(this.getResourceBundle().getText("downloadStarted", [sDocId]));
                } else {
                    this.showErrorMessage(this.getResourceBundle().getText("noPdfAvailable"));
                }
            }
        },

        /**
         * Formatter for error state (handles ABAP true-like values)
         * @public
         * @param {*} v value from OData (boolean true/false or 'X'/' ')
         */
        formatErrorState: function (v) {
            // Map 'E' -> Error, 'P' -> Warning, empty -> Success
            if (v === null || v === undefined) { return "Success"; }
            if (typeof v !== 'string') { return "Success"; }
            var s = v.trim().toUpperCase();
            if (s.indexOf('E') !== -1) { return "Error"; }
            if (s.indexOf('P') !== -1) { return "Warning"; }
            return "Success";
        },

        /**
         * Formatter for error text: show "Error" only when true-like; otherwise empty
         * @public
         * @param {*} v value from OData
         */
        formatErrorText: function (v) {
            if (v === null || v === undefined) { return ""; }
            if (typeof v !== 'string') { return ""; }
            var s = v.trim().toUpperCase();
            if (s.indexOf('E') !== -1) { return this.getResourceBundle().getText("error"); }
            if (s.indexOf('P') !== -1) { return "Pendiente"; }
            return "";
        },

        /**
         * Helper to normalize ABAP/JS truthy representations: true, 1, '1', 'X', 'x', 'true'
         * @private
         */
        _isTrueLike: function (v) {
            if (v === true || v === 1) { return true; }
            if (typeof v === "string") {
                var s = v.trim().toLowerCase();
                return s === "x" || s === "1" || s === "true";
            }
            return false;
        },

        /**
         * Formatter for sort icon
         * @public
         * @param {boolean} bDescending sort order
         * @returns {string} icon name
         */
        formatSortIcon: function (bDescending) {
            console.log("formatSortIcon called with: ", bDescending);
            if (bDescending === true) {
                return "sap-icon://sort-descending";
            } else if (bDescending === false) {
                return "sap-icon://sort-ascending";
            } else {
                return "sap-icon://sort";
            }
        },

        /**
         * Event handler for sorting by DocId column
         * @public
         */
        onSortDocId: function () {
            console.log("onSortDocId called");
            this._debugTableState();
            this._sortTable("DocId");
        },

        /**
         * Event handler for sorting by ModifiedAt column
         * @public
         */
        onSortModifiedAt: function () {
            console.log("onSortModifiedAt called");
            this._debugTableState();
            this._sortTable("ModifiedAt");
        },

        // onSearch removed: we rely on SmartFilterBar's search

        /**
         * SmartFilterBar search event: collect SFB filters and custom checkbox, apply to rows binding
         */
        onSmartFilterBarSearch: function () {
            // Delegate to centralized filter applier so quick-filters and SFB combine consistently
            this._applyFilters();
        },

        /**
         * Toggle handler for quick filter 'only errors'
         */
        onToggleErrorFilter: function (oEvent) {
            var bPressed = !!(oEvent && oEvent.getSource && oEvent.getSource().getPressed && oEvent.getSource().getPressed());
            var oViewModel = this.getModel("viewModel");
            // If the user is activating this filter, ensure the other quick-filter is deactivated
            if (bPressed) {
                oViewModel.setProperty("/onlyPending", false);
            }
            oViewModel.setProperty("/onlyErrors", bPressed);
            this._applyFilters();
        },

        /**
         * Toggle handler for quick filter 'only pending' (Error = 'P')
         */
        onTogglePendingFilter: function (oEvent) {
            var bPressed = !!(oEvent && oEvent.getSource && oEvent.getSource().getPressed && oEvent.getSource().getPressed());
            var oViewModel = this.getModel("viewModel");
            // If the user is activating this filter, ensure the other quick-filter is deactivated
            if (bPressed) {
                oViewModel.setProperty("/onlyErrors", false);
            }
            oViewModel.setProperty("/onlyPending", bPressed);
            this._applyFilters();
        },

        /**
         * Combine SmartFilterBar filters with quick filters (like onlyErrors) and apply them
         * as Application filters on the table binding.
         * @private
         */
        _applyFilters: function () {
            var oSFB = this.byId("idSmartFilterBar");
            var aFilters = oSFB ? (oSFB.getFilters() || []) : [];

            // Basic search value -> OR across several text fields (keep existing behavior)
            if (oSFB && oSFB.getBasicSearchValue) {
                var sQuery = (oSFB.getBasicSearchValue() || "").trim();
                if (sQuery) {
                    aFilters.push(new Filter([
                        new Filter("FileName", FilterOperator.Contains, sQuery),
                        new Filter("ObjectDescription", FilterOperator.Contains, sQuery),
                        new Filter("Username", FilterOperator.Contains, sQuery),
                        new Filter("DocId", FilterOperator.Contains, sQuery)
                    ], false));
                }
            }

            // Quick filters: only errors -> Error = 'E', only pending -> Error = 'P'
            var oViewModel = this.getModel("viewModel");
            var bOnlyErrors = oViewModel && oViewModel.getProperty("/onlyErrors");
            var bOnlyPending = oViewModel && oViewModel.getProperty("/onlyPending");
            if (bOnlyErrors && bOnlyPending) {
                // Both pressed -> show rows with Error = 'E' OR Error = 'P'
                var fE = new Filter("Error", FilterOperator.EQ, 'E');
                var fP = new Filter("Error", FilterOperator.EQ, 'P');
                aFilters.push(new Filter([fE, fP], false));
            } else if (bOnlyErrors) {
                aFilters.push(new Filter("Error", FilterOperator.EQ, 'E'));
            } else if (bOnlyPending) {
                aFilters.push(new Filter("Error", FilterOperator.EQ, 'P'));
            }

            var oTable = this.byId("idDocumentsTable");
            var oBinding = oTable && oTable.getBinding("rows");
            if (oBinding) {
                // Clear control filters to avoid conflicts
                oBinding.filter([], sap.ui.model.FilterType.Control);
                oBinding.filter(aFilters, sap.ui.model.FilterType.Application);
            }
        },

        /**
         * Internal method to sort table by specified field
         * @private
         * @param {string} sField field name to sort by
         */
        _sortTable: function (sField) {
            console.log("Sorting by field: " + sField);
            var oTable = this.byId("idDocumentsTable");
            var oBinding = oTable.getBinding("rows");
            var oViewModel = this.getModel("viewModel");

            if (!oBinding) {
                console.error("No binding found on table");
                this.showErrorMessage("No se pudo acceder a los datos de la tabla");
                return;
            }

            console.log("Current binding: ", oBinding);

            // Get current sort state for this field
            var sSortKey = "sortOrder" + sField;
            var bCurrentDescending = oViewModel.getProperty("/" + sSortKey);

            // Toggle sort order (undefined -> false -> true -> false...)
            var bNewDescending;
            if (bCurrentDescending === undefined || bCurrentDescending === null) {
                bNewDescending = false; // First click: ascending
            } else {
                bNewDescending = !bCurrentDescending; // Toggle
            }

            console.log("Sort order - Current: " + bCurrentDescending + ", New: " + bNewDescending);

            // Update view model
            oViewModel.setProperty("/" + sSortKey, bNewDescending);

            // Reset other sort states
            if (sField === "DocId") {
                oViewModel.setProperty("/sortOrderModifiedAt", undefined);
            } else if (sField === "ModifiedAt") {
                oViewModel.setProperty("/sortOrderDocId", undefined);
            }

            try {
                // Create sorter
                var oSorter = new Sorter(sField, bNewDescending);
                console.log("Created sorter: ", oSorter);

                // Apply sort to binding
                oBinding.sort([oSorter]);
                console.log("Sort applied successfully");

                // Debug after applying sort
                this._debugTableState();

                // Show success message
                var sOrder = bNewDescending ? this.getResourceBundle().getText("descending") : this.getResourceBundle().getText("ascending");
                var sFieldText = sField === "DocId" ? this.getResourceBundle().getText("docId") : this.getResourceBundle().getText("modifiedAt");
                var sMessage = this.getResourceBundle().getText("sortApplied", [sFieldText, sOrder]);
                this.showMessage(sMessage);

            } catch (oError) {
                console.error("Error applying sort: ", oError);
                this.showErrorMessage("Error al aplicar el ordenamiento: " + oError.message);
            }
        },

        /**
         * Apply filters from the top filter bar (Only Errors, Username contains, Date Range on ModifiedAt)
         */
        // Removed manual filter bar handlers (onApplyFilters, onClearFilters)
        /**
         * Handle row selection change for sap.ui.table.Table
         */
        onRowSelectionChange: function (oEvent) {
            var oTable = this.byId("idDocumentsTable");
            var aSel = oTable.getSelectedIndices();
            var oViewModel = this.getModel("viewModel");
            if (aSel && aSel.length > 0) {
                var oCtx = oTable.getContextByIndex(aSel[0]);
                if (oCtx) {
                    oViewModel.setProperty("/hasSelection", true);
                    oViewModel.setProperty("/selectedItem", oCtx.getObject());
                    return;
                }
            }
            oViewModel.setProperty("/hasSelection", false);
            oViewModel.setProperty("/selectedItem", null);
        }
    });
});
