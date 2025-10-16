sap.ui.define([
    "zui5cadoclist/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter"
],
function (BaseController, JSONModel, Filter, FilterOperator, Sorter) {
    "use strict";

    return BaseController.extend("zui5cadoclist.controller.DocumentList", {
        
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
            var oTable = this.byId("documentsTable");
            if (oTable && oTable.getBinding("items")) {
                oTable.getBinding("items").refresh();
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
            var oTable = this.byId("documentsTable");
            console.log("=== TABLE DEBUG INFO ===");
            console.log("Table found: ", !!oTable);
            if (oTable) {
                var oBinding = oTable.getBinding("items");
                console.log("Binding found: ", !!oBinding);
                if (oBinding) {
                    console.log("Binding path: ", oBinding.getPath());
                    console.log("Binding length: ", oBinding.getLength());
                    console.log("Current sorters: ", oBinding.aSorters);
                }
                console.log("Table items count: ", oTable.getItems().length);
            }
            console.log("=== END DEBUG INFO ===");
        },

        /**
         * Event handler for table item press
         * @public
         * @param {sap.ui.base.Event} oEvent the press event
         */
        onItemPress: function (oEvent) {
            console.log("Item pressed");
            var oBindingContext = oEvent.getSource().getBindingContext();
            var oViewModel = this.getModel("viewModel");
            
            if (oBindingContext) {
                var sDocId = oBindingContext.getProperty("DocId");
                var sFileName = oBindingContext.getProperty("FileName");
                
                // Update selection state
                oViewModel.setProperty("/hasSelection", true);
                oViewModel.setProperty("/selectedItem", oBindingContext.getObject());
                
                console.log("Selected document: ", oBindingContext.getObject());
                this.showMessage(this.getResourceBundle().getText("documentSelected", [sDocId, sFileName]));
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
            
            if (!this._pdfDialog) {
                this._pdfDialog = sap.ui.xmlfragment("zui5cadoclist.view.fragments.PdfViewer", this);
                this.getView().addDependent(this._pdfDialog);
            }
            
            // Set the PDF data to the dialog model
            var oPdfModel = new JSONModel({
                title: oSelectedItem.FileName,
                docId: oSelectedItem.DocId,
                pdfData: "data:application/pdf;base64," + oSelectedItem.Pdf
            });
            
            this._pdfDialog.setModel(oPdfModel, "pdf");
            this._pdfDialog.open();
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
         * Formatter for error state
         * @public
         * @param {boolean} bError error flag
         * @returns {string} state value
         */
        formatErrorState: function (bError) {
            return bError ? "Error" : "Success";
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

        /**
         * Event handler when a table search is triggered
         * @public
         * @param {sap.ui.base.Event} oEvent the search event
         */
        onSearch: function (oEvent) {
            console.log("Search triggered");
            var sQuery = oEvent.getSource().getValue();
            var oTable = this.byId("documentsTable");
            var oBinding = oTable.getBinding("items");

            if (!oBinding) {
                console.log("No binding available on table");
                return;
            }

            if (sQuery && sQuery.length > 0) {
                var aFilters = [
                    new Filter("FileName", FilterOperator.Contains, sQuery),
                    new Filter("ObjectDescription", FilterOperator.Contains, sQuery),
                    new Filter("Username", FilterOperator.Contains, sQuery),
                    new Filter("DocId", FilterOperator.Contains, sQuery)
                ];
                var oFilter = new Filter(aFilters, false);
                oBinding.filter([oFilter]);
            } else {
                oBinding.filter([]);
            }
        },

        /**
         * Internal method to sort table by specified field
         * @private
         * @param {string} sField field name to sort by
         */
        _sortTable: function (sField) {
            console.log("Sorting by field: " + sField);
            var oTable = this.byId("documentsTable");
            var oBinding = oTable.getBinding("items");
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
        }
    });
});
