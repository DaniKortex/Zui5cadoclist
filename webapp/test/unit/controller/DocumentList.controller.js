/*global QUnit*/

sap.ui.define([
	"zui5cadoclist/controller/DocumentList.controller"
], function (Controller) {
	"use strict";

	QUnit.module("DocumentList Controller");

	QUnit.test("I should test the DocumentList controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
