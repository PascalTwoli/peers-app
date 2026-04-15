module.exports = [
"[project]/packages/marketing/components/ScreenshotCard.jsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ScreenshotCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
function ScreenshotCard({ title, caption, src, ratio = "aspect-video" }) {
    const candidates = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        if (!src) return [];
        const extMatch = src.match(/\.(png|jpe?g|webp)$/i);
        if (extMatch) {
            const provided = extMatch[1].toLowerCase() === "jpg" ? "jpeg" : extMatch[1].toLowerCase();
            const base = src.replace(/\.(png|jpe?g|webp)$/i, "");
            const allExt = [
                "png",
                "jpeg",
                "webp"
            ];
            return [
                `${base}.${provided}`,
                ...allExt.filter((ext)=>ext !== provided).map((ext)=>`${base}.${ext}`)
            ];
        }
        return [
            "png",
            "jpeg",
            "webp"
        ].map((ext)=>`${src}.${ext}`);
    }, [
        src
    ]);
    const [currentIndex, setCurrentIndex] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [hasError, setHasError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        setCurrentIndex(0);
        setHasError(false);
    }, [
        src
    ]);
    const activeSrc = candidates[currentIndex] || "";
    const showPlaceholder = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>!src || hasError || !activeSrc, [
        src,
        hasError,
        activeSrc
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "group rounded-3xl border border-line bg-panel/90 p-3 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-cyan",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `${ratio} relative overflow-hidden rounded-2xl border border-line bg-slate-900/80`,
                children: [
                    !showPlaceholder && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                        src: activeSrc,
                        alt: `${title} screenshot`,
                        className: "h-full w-full object-cover",
                        onError: ()=>{
                            if (currentIndex < candidates.length - 1) {
                                setCurrentIndex((idx)=>idx + 1);
                                return;
                            }
                            setHasError(true);
                        }
                    }, void 0, false, {
                        fileName: "[project]/packages/marketing/components/ScreenshotCard.jsx",
                        lineNumber: 53,
                        columnNumber: 6
                    }, this),
                    showPlaceholder && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex h-full items-center justify-center bg-gradient-to-br from-cyan-500/10 via-slate-900 to-blue-500/10 p-6 text-center text-sm text-slate-400",
                        children: "Screenshot placeholder"
                    }, void 0, false, {
                        fileName: "[project]/packages/marketing/components/ScreenshotCard.jsx",
                        lineNumber: 68,
                        columnNumber: 6
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/packages/marketing/components/ScreenshotCard.jsx",
                lineNumber: 50,
                columnNumber: 4
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "px-1 pb-1 pt-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-base font-semibold text-white",
                        children: title
                    }, void 0, false, {
                        fileName: "[project]/packages/marketing/components/ScreenshotCard.jsx",
                        lineNumber: 74,
                        columnNumber: 5
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-1 text-sm text-slate-400",
                        children: caption
                    }, void 0, false, {
                        fileName: "[project]/packages/marketing/components/ScreenshotCard.jsx",
                        lineNumber: 75,
                        columnNumber: 5
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/packages/marketing/components/ScreenshotCard.jsx",
                lineNumber: 73,
                columnNumber: 4
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/packages/marketing/components/ScreenshotCard.jsx",
        lineNumber: 49,
        columnNumber: 3
    }, this);
}
}),
];

//# sourceMappingURL=packages_marketing_components_ScreenshotCard_jsx_0qj95gk._.js.map