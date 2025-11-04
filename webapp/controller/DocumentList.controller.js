
sap.ui.define([
    "zui5cadoclist/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/ui/core/Fragment"
],
function (BaseController, JSONModel, Filter, FilterOperator, Sorter, Fragment) {
    "use strict";

    return BaseController.extend("zui5cadoclist.controller.DocumentList", {
       
        /**
         * Formatter para mostrar el status: 'Pendiente' si ObjKey vacío, si no mostrar vacío
         */
        formatStatusText: function(v) {
            if (!v || (typeof v === 'string' && v.trim() === '')) {
                return 'Pendiente';
            }
            return '';
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
                selectedItem: null
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
        formatEditVisible: function (vError, vObjKey) {
            var bError = this._isTrueLike(vError);
            var bPending = !vObjKey || (typeof vObjKey === "string" && vObjKey.trim() === "");
            return bError || bPending;
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
         * Handler para click en Clave Objeto: abre diálogo dinámico según requiredFields
         */
        onObjKeyLinkPress: function(oEvent) {
            var oSource = oEvent.getSource();
            var oCtx = oSource.getBindingContext();
            var oData = oCtx.getObject();
            var that = this;
            // Permitir edición si hay Error o si el Status es 'Pendiente' (ObjKey vacío)
            var bIsError = this._isTrueLike(oData.Error);
            var bIsPending = !oData.ObjKey || (typeof oData.ObjKey === "string" && oData.ObjKey.trim() === "");
            if (!(bIsError || bIsPending)) {
                this.showMessage("Solo se puede editar si la línea contiene Error o está Pendiente.");
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
                        // Cada resultado puede tener FieldName y Description
                        aFields = oResult.results.map(function(o){
                            return {
                                field: o.FieldName,
                                description: o.Description || ""
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
            // Solo visualización: recorrer aFields (et_entityset) y mostrar DESCRIPTION + input vacío
            var oVBox = oDialog.getContent()[0];
            oVBox.removeAllItems();
            aFields.forEach(function(oField, idx) {
                var sLabel = (oField.description && oField.description.trim() !== "") ? oField.description : (oField.field || ("Campo " + (idx+1)));
                var sInputId = "idInput_" + idx;
                oVBox.addItem(new sap.m.Label({ text: sLabel, labelFor: sInputId }));
                oVBox.addItem(new sap.m.Input({ id: sInputId, value: "" }));
            });
            oDialog.open();
        },

        /**
         * Guardar cambios del diálogo dinámico
         */
        onDynamicEditDialogSave: function() {
            var oDialog = this._dynamicEditDialog;
            var oEditModel = oDialog.getModel("editDynamic");
            var oData = oEditModel.getData();
            var oModel = this.getModel();
            var that = this;
            var sPath = oModel.createKey("/PdfListSet", { DocId: oData.DocId });
            oModel.update(sPath, oData, {
                success: function() {
                    that.showSuccessMessage("Datos actualizados correctamente");
                    oDialog.close();
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
            var oModel = this.getModel();
            var that = this;

            // Construir la key para el update
            var sPath = oModel.createKey("/PdfListSet", { DocId: oData.DocId });

            oModel.update(sPath, oData, {
                success: function() {
                    that.showSuccessMessage("Datos actualizados correctamente");
                    oDialog.close();
                    // Refrescar tabla
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
            return this._isTrueLike(v) ? "Error" : "Success";
        },

        /**
         * Formatter for error text: show "Error" only when true-like; otherwise empty
         * @public
         * @param {*} v value from OData
         */
        formatErrorText: function (v) {
            return this._isTrueLike(v) ? this.getResourceBundle().getText("error") : "";
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
            var oSFB = this.byId("idSmartFilterBar");
            var aFilters = oSFB ? (oSFB.getFilters() || []) : [];
            // custom checkbox
            var oOnlyErrors = this.byId("idSFBOnlyErrorsCheck");
            if (oOnlyErrors && oOnlyErrors.getSelected()) {
                aFilters.push(new Filter("Error", FilterOperator.EQ, true));
            }
            // basic search value -> OR across several text fields
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
            var oTable = this.byId("idDocumentsTable");
            var oBinding = oTable && oTable.getBinding("rows");
            if (oBinding) {
                // Clear any previous Control filters (e.g., from column menu) to avoid conflicts
                oBinding.filter([], sap.ui.model.FilterType.Control);
                // Apply SmartFilterBar filters as Application filters (server-side)
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
