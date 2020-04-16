/*
 * Copyright (C) 2020 con terra GmbH (info@conterra.de)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import CancelablePromise from "apprt-core/CancelablePromise";
import Graphic from "esri/Graphic";
import Polygon from "esri/geometry/Polygon";
import Circle from "esri/geometry/Circle";
import CircleSpatialInputWidget from "../widgets/CircleSpatialInputWidget.vue";
import Vue from "apprt-vue/Vue";
import VueDijit from "apprt-vue/VueDijit";
import Binding from "apprt-binding/Binding";

const _graphic = Symbol("_graphic");
const _oldGraphic = Symbol("_graphic");
const _binding = Symbol("_binding");

export default class CircleSpatialInputAction {

    activate(componentContext) {
        this._bundleContext = componentContext.getBundleContext();
        const i18n = this.i18n = this._i18n.get().ui.circle;
        this.id = "circle";
        this.title = i18n.title;
        this.description = i18n.description;
        this.iconClass = "icon-selection-circle";
        this.interactive = true;
    }

    deactivate() {
        this[_binding].unbind();
        this[_binding] = undefined;
        this.closeWidget();
        this.removeGraphicFromView();
    }

    onSelectionExecuting() {
        this[_oldGraphic] = this[_graphic];
    }

    trigger(args) {
        return new CancelablePromise((resolve, reject, oncancel) => {
            if (!this._mapWidgetModel) {
                reject("MapWidgetModel not available!");
            }
            if (this[_oldGraphic]) {
                const view = this._mapWidgetModel.get("view");
                view.graphics.add(this[_oldGraphic]);
            }

            const model = this._circleSpatialInputWidgetModel;
            const vm = new Vue(CircleSpatialInputWidget);
            vm.i18n = this.i18n;
            vm.minRadius = model.minRadius;
            vm.maxRadius = model.maxRadius;
            vm.innerRadius = model.innerRadius;
            vm.outerRadius = model.outerRadius;
            vm.stepSize = model.stepSize;

            this[_binding] = Binding.for(vm, model)
                .syncAllToRight("innerRadius", "outerRadius")
                .enable();

            const widget = new VueDijit(vm);
            const serviceProperties = {
                "widgetRole": "circleSpatialInputWidget"
            };
            const interfaces = ["dijit.Widget"];
            if (!this._serviceregistration) {
                this._serviceregistration = this._bundleContext.registerService(interfaces, widget, serviceProperties);
            }

            const view = this._mapWidgetModel.get("view");
            const clickHandle = view.on("click", (evt) => {
                this.removeGraphicFromView();
                clickHandle.remove();
                // prevent popup
                evt.stopPropagation();
                const point = view.toMap({x: evt.x, y: evt.y});
                const circleGeometry = this.createDonut(point);
                if (args.queryBuilderSelection) {
                    this.closeWidget();
                } else {
                    this.addGraphicToView(circleGeometry);
                }
                resolve(circleGeometry);
            });

            oncancel(() => {
                clickHandle.remove();
                this.removeGraphicFromView();
                this.closeWidget();
                console.debug("CircleSpatialInputAction was canceled...");
            });
        });
    }

    closeWidget() {
        const registration = this._serviceregistration;

        // clear the reference
        this._serviceregistration = null;

        if (registration) {
            // call unregister
            registration.unregister();
        }
    }

    createDonut(point) {
        const model = this._circleSpatialInputWidgetModel;
        const innerCircle = this.createCircle(point, model.innerRadius);
        const outerCircle = this.createCircle(point, model.outerRadius);
        const circleGeometry = new Polygon({
            spatialReference: point.spatialReference
        });
        circleGeometry.addRing(innerCircle.rings[0]);
        circleGeometry.addRing(outerCircle.rings[0]);
        return circleGeometry;
    }

    createCircle(center, radius) {
        let geodesic = false;
        if (center.spatialReference.wkid === 3857
            || center.spatialReference.wkid === 4326
            || center.spatialReference.latestWkid === 3857
            || center.spatialReference.latestWkid === 4326) {
            geodesic = true;
        }

        return new Circle({
            geodesic: geodesic,
            center: center,
            radius: radius,
            radiusUnit: "meters"
        });
    }

    addGraphicToView(geometry) {
        this.removeGraphicFromView();
        const view = this._mapWidgetModel.get("view");
        const symbol = {
            type: "simple-fill",
            color: [255, 0, 0, 0.25],
            style: "solid",
            outline: {
                color: [255, 0, 0, 1],
                width: "2px"
            }
        };
        const graphic = this[_graphic] = new Graphic({
            geometry: geometry,
            symbol: symbol
        });
        view.graphics.add(graphic);
    }

    removeGraphicFromView() {
        const view = this._mapWidgetModel.get("view");
        if (this[_oldGraphic]) {
            view.graphics.remove(this[_oldGraphic]);
        }
        if (this[_graphic]) {
            view.graphics.remove(this[_graphic]);
            this[_graphic] = null;
        }
    }
}