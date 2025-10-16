sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/core/UIComponent",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, History, UIComponent, MessageToast, MessageBox) {
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
        }

    });

});