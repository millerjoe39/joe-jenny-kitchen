
/*
 * Joe & Jenny Kitchen — API bridge
 *
 * IMPORTANT:
 * Replace API_BASE below with the clean Apps Script Web App URL ending in /exec.
 * Example: https://script.google.com/macros/s/XXXXXXXX/exec
 *
 * We use JSONP because Apps Script ContentService responses are redirected and
 * browser cross-origin rules can otherwise get in the way. Google documents
 * JSONP as an option for read-only JSON services.
 */
const API_BASE = "https://script.google.com/macros/s/AKfycbxPfeoOkpGxsI2fMzqFzmfCGHtQkb-Za9Ijcxay1PjG-hzzfTBIRW96e7uwVCmKI_st/exec";

const KEY="joe-jenny-week1-grocery";
const NOTEKEY="joe-jenny-week1-notes";

const boxes=[...document.querySelectorAll("input[data-g]")];

function saveChecks(){
  localStorage.setItem(KEY, JSON.stringify(boxes.map(x=>x.checked)));
  updateProgress();
}
function loadChecks(){
  try{
    const vals=JSON.parse(localStorage.getItem(KEY)||"[]");
    boxes.forEach((x,i)=>{
      x.checked=!!vals[i];
      x.closest(".check").classList.toggle("done",x.checked)
    });
  }catch(e){}
  updateProgress();
}
function updateProgress(){
  const done=boxes.filter(x=>x.checked).length;
  const pct=boxes.length?Math.round(done/boxes.length*100):0;
  document.getElementById("groceryProgress").value=pct/100;
  document.getElementById("progressText").textContent=pct+"%";
  boxes.forEach(x=>x.closest(".check").classList.toggle("done",x.checked));
}
boxes.forEach(x=>x.addEventListener("change",saveChecks));
function clearChecks(){
  localStorage.removeItem(KEY);
  boxes.forEach(x=>x.checked=false);
  updateProgress();
}
function saveNotes(){
  localStorage.setItem(NOTEKEY,document.getElementById("notesBox").value);
  document.getElementById("saveStatus").textContent="Saved on this device.";
}

/* ---- Live Kitchen API ---- */
function apiJsonp(action, extraParams={}){
  return new Promise((resolve,reject)=>{
    if(!API_BASE || API_BASE.includes("PASTE_YOUR")){
      reject(new Error("API_BASE is not configured"));
      return;
    }

    const callbackName="kitchenApi_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script");
    const params=new URLSearchParams({action, prefix:callbackName, ...extraParams});

    window[callbackName]=(payload)=>{
      cleanup();
      if(payload && payload.ok) resolve(payload);
      else reject(new Error(payload?.error || "API returned an error"));
    };

    function cleanup(){
      delete window[callbackName];
      script.remove();
    }

    script.onerror=()=>{
      cleanup();
      reject(new Error("Could not reach Kitchen API"));
    };

    script.src=API_BASE+(API_BASE.includes("?")?"&":"?")+params.toString();
    document.head.appendChild(script);
  });
}

function money(value){
  const n=Number(value);
  return Number.isFinite(n) ? "$"+n.toFixed(2) : "—";
}

async function loadLiveKitchenData(){
  const status=document.getElementById("apiStatus");
  const snapshot=document.getElementById("productSnapshot");

  try{
    const [productResult, priceResult]=await Promise.all([
      apiJsonp("products"),
      apiJsonp("prices")
    ]);

    const products=(productResult.data||[]).filter(p=>p.active!==false);
    const prices=(priceResult.data||[]).filter(p=>p.product_id);

    // Build a current-price lookup. If a product has multiple observations,
    // use the most recent dated observation.
    const latestPriceByProduct={};
    prices.forEach(row=>{
      const existing=latestPriceByProduct[row.product_id];
      if(!existing || String(row.date_checked) > String(existing.date_checked)){
        latestPriceByProduct[row.product_id]=row;
      }
    });

    status.innerHTML="<strong>Database:</strong> connected · "+products.length+
      " active products · "+prices.length+" price observations";

    const featured=products.filter(p=>[
      "PROD001","PROD002","PROD003","PROD004","PROD005","PROD012"
    ].includes(p.product_id));

    snapshot.innerHTML=featured.map(p=>{
      const price=latestPriceByProduct[p.product_id];
      const sale=price && price.sale_price!=="" && Number(price.sale_price)>0
        ? Number(price.sale_price) : null;
      const regular=price && price.regular_price!=="" && Number(price.regular_price)>0
        ? Number(price.regular_price) : null;
      const displayPrice=sale ?? regular;
      const priceLabel=sale !== null
        ? `<strong>${money(sale)}</strong> <span class="small">sale</span>${regular!==null ? ` <span class="small"><s>${money(regular)}</s></span>` : ""}`
        : regular!==null
          ? `<strong>${money(regular)}</strong>`
          : `<strong>Price not verified</strong>`;

      return `
      <div class="card" style="margin:0">
        <h3 style="margin-top:0">${escapeHtml(p.product_name)}</h3>
        <div class="small">${escapeHtml(p.brand||"")} · ${escapeHtml(p.package_size||"")}</div>
        <p>${priceLabel}</p>
        <div class="small">
          ${p.calories!=="" ? escapeHtml(String(p.calories))+" cal" : "Nutrition pending"}
          ${p.sugar_g!=="" ? " · "+escapeHtml(String(p.sugar_g))+"g sugar" : ""}
          ${p.sodium_mg!=="" ? " · "+escapeHtml(String(p.sodium_mg))+"mg sodium" : ""}
        </div>
        ${price && price.date_checked ? `<div class="small" style="margin-top:8px">Price checked ${escapeHtml(String(price.date_checked))}</div>` : ""}
      </div>`;
    }).join("");

    if(!featured.length){
      snapshot.innerHTML='<div class="small">Product catalog is connected. Featured comparison data will appear as we add it.</div>';
    }
  }catch(err){
    status.innerHTML="<strong>Database:</strong> connected to page, but live price data could not be loaded";
    snapshot.innerHTML='<div class="small">Products are available, but the price endpoint needs attention. The rest of the Kitchen can still load.</div>';
    console.warn("Kitchen API:", err);
  }
}

function escapeHtml(value){
  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}


const CHOICE_KEY="joe-jenny-product-choices";
function loadChoices(){try{return JSON.parse(localStorage.getItem(CHOICE_KEY)||"{}")}catch(e){return {}}}
function saveChoices(c){localStorage.setItem(CHOICE_KEY,JSON.stringify(c))}
function choicePrice(row){
  if(!row)return null;
  const sale=Number(row.sale_price), regular=Number(row.regular_price);
  if(Number.isFinite(sale)&&sale>0)return {value:sale,sale:true,regular:Number.isFinite(regular)&&regular>0?regular:null};
  if(Number.isFinite(regular)&&regular>0)return {value:regular,sale:false,regular};
  return null;
}
function productCard(p,priceRow,selectedId){
  const price=choicePrice(priceRow);
  const nutrition=[
    p.calories!==""?`${escapeHtml(String(p.calories))} cal`:"",
    p.protein_g!==""?`${escapeHtml(String(p.protein_g))}g protein`:"",
    p.sugar_g!==""?`${escapeHtml(String(p.sugar_g))}g sugar`:"",
    p.sodium_mg!==""?`${escapeHtml(String(p.sodium_mg))}mg sodium`:""
  ].filter(Boolean).join(" · ");
  const reasons={
    PROD001:"28 oz package at the same listed price as the crunchy option.",
    PROD002:"28 oz package with lower listed calories and sodium than the creamy option.",
    PROD003:"Smaller 18 oz package; useful if package size or upfront cost is the priority.",
    PROD004:"Plain Greek yogurt is a versatile base for breakfasts, sauces, and snacks.",
    PROD005:"Sweetened honey-vanilla option for convenient sweetness.",
    PROD012:"42 oz package; useful as a household breakfast staple."
  };
  const checked=p.product_id===selectedId;
  return `<div class="choice-option ${checked?"selected":""}">
    <label><input type="radio" name="choice-${escapeHtml(p.ingredient_id)}" value="${escapeHtml(p.product_id)}" ${checked?"checked":""}>
    <strong>${escapeHtml(p.product_name)}</strong></label>
    <div class="small">${escapeHtml(p.brand||"")} · ${escapeHtml(p.package_size||"")}</div>
    <div class="choice-price">${price?money(price.value):"Price not verified"}${price?.sale?` <span class="small">sale <s>${money(price.regular)}</s></span>`:""}</div>
    <div class="choice-meta">${nutrition||"Nutrition pending"}</div>
    <div class="choice-reason">${escapeHtml(reasons[p.product_id]||"Product information available in the Kitchen database.")}</div>
  </div>`;
}
function renderChoiceGroups(products,prices){
  const container=document.getElementById("choiceGroups"), choices=loadChoices();
  const groups=[
    {ingredient:"ING007",name:"Peanut Butter",ids:["PROD001","PROD002","PROD003"]},
    {ingredient:"ING006",name:"Greek Yogurt",ids:["PROD004","PROD005"]},
    {ingredient:"ING025",name:"Old-Fashioned Oats",ids:["PROD012"]}
  ];
  const byId=Object.fromEntries(products.map(p=>[p.product_id,p])), latest={};
  prices.forEach(row=>{if(row.product_id&&(!latest[row.product_id]||String(row.date_checked)>String(latest[row.product_id].date_checked)))latest[row.product_id]=row});
  container.innerHTML=groups.map(group=>{
    const available=group.ids.map(id=>byId[id]).filter(Boolean);
    if(!available.length)return "";
    const selected=choices[group.ingredient]||available[0].product_id;
    return `<div class="choice-group"><h3>${escapeHtml(group.name)}</h3>
      <p class="choice-subtitle small">Choose the product that fits this week's priorities. Your choice is saved on this device.</p>
      <div class="choice-options">${available.map(p=>productCard(p,latest[p.product_id],selected)).join("")}</div>
      <div class="choice-selected" id="selected-${group.ingredient}"></div></div>`;
  }).join("");
  groups.forEach(group=>{
    const radios=[...document.querySelectorAll(`input[name="choice-${group.ingredient}"]`)];
    const available=group.ids.map(id=>byId[id]).filter(Boolean);
    if(!radios.length)return;
    const update=()=>{
      const selected=radios.find(r=>r.checked)?.value;if(!selected)return;
      const state=loadChoices();state[group.ingredient]=selected;saveChoices(state);
      radios.forEach(r=>r.closest(".choice-option")?.classList.toggle("selected",r.checked));
      const chosen=byId[selected], target=document.getElementById(`selected-${group.ingredient}`);
      if(target)target.textContent=`Selected: ${chosen.product_name}`;
      updateSelectedShopping();
    };
    radios.forEach(r=>r.addEventListener("change",update));update();
  });
}



function loadShoppingTripState(){
  try{return JSON.parse(localStorage.getItem(SHOPPING_TRIP_KEY)||"{}")}catch(e){return {}}
}
function saveShoppingTripState(state){localStorage.setItem(SHOPPING_TRIP_KEY,JSON.stringify(state))}
function clearShoppingTrip(){
  localStorage.removeItem(SHOPPING_TRIP_KEY);
  loadWeeklyCart();
}
function renderShoppingTrip(rows,budget){
  const wrap=document.getElementById("shoppingTripItems");
  const summary=document.getElementById("shoppingTripSummary");
  if(!wrap||!summary)return;
  const state=loadShoppingTripState();
  const buyRows=rows.filter(r=>!r.haveIt && r.coverage.status==="ok" && r.product);
  if(!buyRows.length){
    summary.innerHTML='<div class="small">No package-ready purchases are available yet. Items without a verified package conversion remain in the Cart Estimate above.</div>';
    wrap.innerHTML="";
    return;
  }
  let estimated=0, actual=0, purchased=0, actualCount=0;
  buyRows.forEach(r=>{
    const id=r.ingredientId;
    estimated += r.price ? r.price.value*r.coverage.packages : 0;
    if(state[id]?.purchased)purchased++;
    if(state[id]?.actualPrice!==undefined && state[id]?.actualPrice!=="" && Number.isFinite(Number(state[id].actualPrice))){actual += Number(state[id].actualPrice); actualCount++;}
  });
  const remaining=Number(budget||0)-estimated;
  summary.innerHTML=`<div class="cart-kpis">
    <div class="cart-kpi"><span>Packages to buy</span><strong>${buyRows.reduce((n,r)=>n+r.coverage.packages,0)}</strong></div>
    <div class="cart-kpi"><span>Estimated cart</span><strong>${money(estimated)}</strong></div>
    <div class="cart-kpi"><span>Budget remaining</span><strong>${remaining>=0?money(remaining):"-"+money(Math.abs(remaining))}</strong></div>
    <div class="cart-kpi"><span>Purchased</span><strong>${purchased}/${buyRows.length}</strong></div>
  </div>${actualCount?`<div class="small" style="margin-top:10px">Actual prices entered: <strong>${money(actual)}</strong> across ${actualCount} item${actualCount===1?"":"s"}.</div>`:""}`;
  wrap.innerHTML=buyRows.map(r=>{
    const id=r.ingredientId, st=state[id]||{};
    const name=r.ingredient?.name||id;
    const productText=`${r.product.brand||""} ${r.product.product_name||""}`.trim();
    const packageText=`${r.coverage.packages} × ${r.coverage.packageLabel}`;
    const estimate=r.price?money(r.price.value*r.coverage.packages):"Price not verified";
    return `<div class="shopping-trip-row ${st.purchased?"purchased":""}" data-trip-id="${escapeHtml(id)}">
      <input class="trip-check" type="checkbox" ${st.purchased?"checked":""} aria-label="Purchased ${escapeHtml(name)}">
      <div><div class="trip-name"><strong>${escapeHtml(name)}</strong>${st.purchased?'<span class="trip-badge">Purchased</span>':''}</div>
        <div class="trip-meta">${escapeHtml(productText)} · Buy ${escapeHtml(packageText)} · Est. ${escapeHtml(estimate)}</div>
        <div class="trip-meta">Recipe need: ${Number(r.qty.toFixed(2))} ${escapeHtml(r.unit||"")}${r.coverage.leftover>0?` · approx. ${Number(r.coverage.leftover.toFixed(2))} ${escapeHtml(r.coverage.leftoverUnit)} left`:""}</div>
      </div>
      <div class="trip-price"><label class="small">Actual paid<br><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 5.99" value="${st.actualPrice??""}"></label></div>
    </div>`;
  }).join("");
  wrap.querySelectorAll(".shopping-trip-row").forEach(row=>{
    const id=row.dataset.tripId;
    const check=row.querySelector(".trip-check");
    const price=row.querySelector(".trip-price input");
    const persist=()=>{
      const next=loadShoppingTripState();
      next[id]={purchased:check.checked,actualPrice:price.value};
      if(!check.checked && price.value==="") delete next[id];
      saveShoppingTripState(next);
      renderShoppingTrip(rows,budget);
    };
    check.addEventListener("change",persist);
    price.addEventListener("change",persist);
    price.addEventListener("blur",persist);
  });
}

async function loadWeeklyCart(){
  const status=document.getElementById("cartStatus"), summary=document.getElementById("cartSummary"), items=document.getElementById("cartItems");
  if(!status||!summary||!items)return;
  const PANTRY_KEY="joe-jenny-local-pantry";
const SHOPPING_TRIP_KEY="joe-jenny-shopping-trip";
  const localPantry=()=>{try{return JSON.parse(localStorage.getItem(PANTRY_KEY)||"{}")}catch(e){return {}}};
  const savePantry=x=>localStorage.setItem(PANTRY_KEY,JSON.stringify(x));

  // Conservative unit intelligence. We only convert when the package text and
  // ingredient/unit pairing are explicit enough to support a useful estimate.
  const volumeWeightOz={
    ING025:{cup:3.2}, // old-fashioned oats: approx. 3.2 oz per cup
    ING003:{cup:6.5}, // dry brown rice: approx. 6.5 oz per cup
    ING022:{each:1},
    ING023:{each:1}
  };
  const normalizeUnit=u=>String(u||"").trim().toLowerCase().replace(/\.$/,"");
  const parsePackage=p=>{
    const raw=String(p?.package_size||"").toLowerCase().replace(/,/g,"");
    let m=raw.match(/([0-9]+(?:\.[0-9]+)?)\s*(oz|lb|count|ct|can|cans|dozen)\b/);
    if(!m)return null;
    let qty=Number(m[1]), unit=m[2];
    if(unit==="lb") return {qty:qty*16,unit:"oz",label:`${m[1]} lb`};
    if(unit==="dozen") return {qty:qty*12,unit:"count",label:`${m[1]} dozen`};
    if(unit==="ct") unit="count";
    if(unit==="cans"||unit==="can") unit="can";
    return {qty,unit,label:m[0]};
  };
  const coverageFor=(ingredientId, needQty, needUnit, product)=>{
    const pkg=parsePackage(product); if(!pkg) return {status:"unknown",packages:null,leftover:null,detail:"Package size not structured"};
    const u=normalizeUnit(needUnit);
    let needBase=null;
    if(["oz","ounce","ounces"].includes(u)) needBase={qty:needQty,unit:"oz"};
    else if(["lb","lbs","pound","pounds"].includes(u)) needBase={qty:needQty*16,unit:"oz"};
    else if(["count","each","item","items","piece","pieces"].includes(u)) needBase={qty:needQty,unit:"count"};
    else if(["can","cans"].includes(u)) needBase={qty:needQty,unit:"can"};
    else if(["cup","cups"].includes(u) && volumeWeightOz[ingredientId]?.cup) needBase={qty:needQty*volumeWeightOz[ingredientId].cup,unit:"oz"};
    else return {status:"unknown",packages:null,leftover:null,detail:`No verified ${u||"unit"} conversion`};

    let pkgBase=pkg;
    // A can package is one recipe can; count packages are direct counts.
    if(needBase.unit!==pkgBase.unit){
      if(needBase.unit==="count" && pkgBase.unit==="can") pkgBase={qty:pkgBase.qty,unit:"count",label:pkg.label};
      else if(needBase.unit==="can" && pkgBase.unit==="count") pkgBase={qty:pkgBase.qty,unit:"can",label:pkg.label};
      else return {status:"unknown",packages:null,leftover:null,detail:"Package and recipe units do not match"};
    }
    if(!pkgBase.qty || !Number.isFinite(pkgBase.qty)) return {status:"unknown",packages:null,leftover:null,detail:"Package quantity not usable"};
    const packages=Math.max(1,Math.ceil(needBase.qty/pkgBase.qty));
    const leftover=Math.max(0,packages*pkgBase.qty-needBase.qty);
    const leftoverUnit=needBase.unit;
    return {status:"ok",packages,leftover,leftoverUnit,packageLabel:pkg.label,needBase};
  };

  try{
    const [plansR,mealsR,recipesR,riR,ingredientsR,productsR,pricesR]=await Promise.all([
      apiJsonp("weekly_plans"),apiJsonp("weekly_meals"),apiJsonp("recipes"),
      apiJsonp("recipe_ingredients"),apiJsonp("ingredients"),apiJsonp("products"),apiJsonp("prices")
    ]);
    const plans=plansR.data||[], meals=mealsR.data||[], recipes=recipesR.data||[], ris=riR.data||[],
          ingredients=ingredientsR.data||[], products=(productsR.data||[]).filter(p=>p.active!==false), prices=pricesR.data||[];
    if(!plans.length||!meals.length){
      status.innerHTML="<strong>Cart:</strong> waiting for weekly plan data";
      summary.innerHTML='<div class="small">The calculator is ready, but the Weekly Plans/Weekly Meals tabs do not yet contain enough live rows to calculate a cart.</div>';
      items.innerHTML="";
      return;
    }

    const plan=[...plans].sort((a,b)=>String(b.week_start).localeCompare(String(a.week_start)))[0];
    const planMeals=meals.filter(m=>String(m.week_id)===String(plan.week_id));
    const recipeById=Object.fromEntries(recipes.map(r=>[r.recipe_id,r]));
    const ingredientById=Object.fromEntries(ingredients.map(i=>[i.ingredient_id,i]));
    const productsByIngredient={};
    products.forEach(p=>(productsByIngredient[p.ingredient_id] ||= []).push(p));
    const latest={};
    prices.forEach(row=>{
      if(row.product_id&&(!latest[row.product_id]||String(row.date_checked)>String(latest[row.product_id].date_checked))) latest[row.product_id]=row;
    });
    const choices=loadChoices(), totals={};

    planMeals.forEach(meal=>{
      const recipe=recipeById[meal.recipe_id]; if(!recipe)return;
      const multiplier=(Number(meal.servings)||Number(recipe.servings)||1)/(Number(recipe.servings)||1);
      ris.filter(x=>String(x.recipe_id)===String(recipe.recipe_id)).forEach(ri=>{
        const qty=Number(ri.quantity); if(!Number.isFinite(qty))return;
        // Optional ingredients are still shown in the recipe, but they should not
        // automatically become required purchases in the cart.
        if(String(ri.optional).toLowerCase()==="true" || String(ri.optional).toLowerCase()==="yes") return;
        const key=ri.ingredient_id;
        if(!totals[key])totals[key]={qty:0,unit:ri.unit||"",meals:[]};
        totals[key].qty+=qty*multiplier;
        totals[key].meals.push(recipe.recipe_name);
      });
    });

    const pantry=localPantry();
    const rows=Object.entries(totals).map(([ingredientId,v])=>{
      const ingredient=ingredientById[ingredientId], candidates=productsByIngredient[ingredientId]||[];
      let productId=choices[ingredientId];
      if(!productId||!candidates.some(p=>p.product_id===productId)) productId=candidates[0]?.product_id;
      const product=productId?products.find(p=>p.product_id===productId):null;
      const price=product?choicePrice(latest[product.product_id]):null;
      const coverage=product?coverageFor(ingredientId,v.qty,v.unit,product):{status:"unknown",detail:"No mapped product"};
      return {
        ingredientId, ingredient, qty:v.qty, unit:v.unit, product,
        price, coverage,
        meals:[...new Set(v.meals)], haveIt:!!pantry[ingredientId]
      };
    }).sort((a,b)=>(a.ingredient?.name||"").localeCompare(b.ingredient?.name||""));

    const budget=Number(plan.budget_target)||100;
    renderShoppingTrip(rows,budget);
    const subtotal=rows.reduce((sum,r)=>sum+(r.haveIt||!r.price||r.coverage.status!=="ok"?0:r.price.value*r.coverage.packages),0);
    const packageCount=rows.reduce((sum,r)=>sum+(r.haveIt||r.coverage.status!=="ok"?0:r.coverage.packages),0);
    const conversionUnknown=rows.filter(r=>!r.haveIt&&r.price&&r.coverage.status!=="ok").length;
    const missingPrices=rows.filter(r=>!r.haveIt&&!r.price).length;
    const remaining=budget-subtotal;

    status.innerHTML=`<strong>Cart:</strong> ${escapeHtml(plan.theme||"Current week")} · week of ${escapeHtml(String(plan.week_start||""))}`;
    summary.innerHTML=`<div class="cart-kpis">
      <div class="cart-kpi"><span>Estimated shopping subtotal</span><strong>${money(subtotal)}${conversionUnknown?"*":""}</strong></div>
      <div class="cart-kpi"><span>Budget target</span><strong>${money(budget)}</strong></div>
      <div class="cart-kpi"><span>Budget remaining</span><strong>${remaining>=0?money(remaining):"-"+money(Math.abs(remaining))}</strong></div>
      <div class="cart-kpi"><span>Packages to buy</span><strong>${packageCount}</strong></div>
    </div>${conversionUnknown?'<div class="small" style="margin-top:10px">* Subtotal excludes items whose recipe unit cannot be safely matched to the retail package size.</div>':''}`;

    items.innerHTML=rows.map(r=>{
      const name=r.ingredient?.name||r.ingredientId;
      const productText=r.product?`${r.product.brand||""} ${r.product.product_name||""}`.trim():"No mapped product yet";
      const qty=`${Number(r.qty.toFixed(2))} ${escapeHtml(r.unit||"")}`.trim();
      let purchaseText="Package conversion needed";
      let purchasePrice="Price not verified";
      if(r.haveIt){ purchaseText="Already in pantry"; purchasePrice="—"; }
      else if(r.price&&r.coverage.status==="ok"){
        purchaseText=`Buy ${r.coverage.packages} · ${r.coverage.packageLabel}`;
        if(r.coverage.leftover>0) purchaseText+=` · approx. ${Number(r.coverage.leftover.toFixed(2))} ${r.coverage.leftoverUnit} left`;
        purchasePrice=money(r.price.value*r.coverage.packages);
      } else if(r.price) {
        purchaseText=r.coverage.detail||"Package conversion needed";
      }
      return `<div class="cart-item ${r.haveIt?"have-it":""}" data-ingredient="${escapeHtml(r.ingredientId)}">
        <div><strong>${escapeHtml(name)}</strong>
          <div class="small">Recipe need: ${qty} · ${escapeHtml(productText)}</div>
          <div class="small"><strong>${escapeHtml(purchaseText)}</strong></div>
          ${r.meals.length?`<div class="small">Used in: ${escapeHtml(r.meals.slice(0,3).join(", "))}</div>`:""}
          <label class="pantry-check"><input type="checkbox" class="have-it-toggle" ${r.haveIt?"checked":""}> Already have it</label>
        </div>
        <div class="cart-item-price"><strong>${purchasePrice}</strong></div>
      </div>`;
    }).join("");

    items.querySelectorAll(".have-it-toggle").forEach(box=>{
      box.addEventListener("change",()=>{
        const row=box.closest(".cart-item"), id=row.dataset.ingredient;
        const state=localPantry(); state[id]=box.checked;
        if(!box.checked) delete state[id];
        savePantry(state);
        loadWeeklyCart();
      });
    });

    if(missingPrices) status.innerHTML += ` · ${missingPrices} shopping price${missingPrices===1?"":"s"} not verified`;
    if(conversionUnknown) status.innerHTML += ` · ${conversionUnknown} package conversion${conversionUnknown===1?"":"s"} not verified`;
  }catch(err){
    status.innerHTML="<strong>Cart:</strong> unable to calculate";
    summary.innerHTML='<div class="small">The calculator could not combine the live weekly plan with recipe/product data yet.</div>';
    items.innerHTML="";
    console.warn("Weekly cart:",err);
  }
}
async function updateSelectedShopping(){
  const wrap=document.getElementById("selectedShoppingItems");
  const totalEl=document.getElementById("selectedShoppingTotal");
  if(!wrap||!totalEl)return;
  try{
    const [productsResult,priceResult]=await Promise.all([apiJsonp("products"),apiJsonp("prices")]);
    const products=(productsResult.data||[]).filter(p=>p.active!==false);
    const prices=priceResult.data||[];
    const choices=loadChoices();
    const byId=Object.fromEntries(products.map(p=>[p.product_id,p]));
    const latest={};
    prices.forEach(row=>{
      if(row.product_id&&(!latest[row.product_id]||String(row.date_checked)>String(latest[row.product_id].date_checked))){
        latest[row.product_id]=row;
      }
    });
    const ingredientNames={
      ING007:"Peanut butter",
      ING006:"Plain/Greek yogurt",
      ING025:"Old-fashioned oats"
    };
    const selectedIds=["ING007","ING006","ING025"].map(ing=>({ing,id:choices[ing]})).filter(x=>x.id&&byId[x.id]);
    if(!selectedIds.length){
      wrap.innerHTML='<div class="small">Make a product selection above to see it here.</div>';
      totalEl.textContent="";
      return;
    }
    let total=0, priced=0;
    wrap.innerHTML=selectedIds.map(({ing,id})=>{
      const p=byId[id], pr=choicePrice(latest[id]);
      if(pr){total+=pr.value;priced++;}
      return `<div class="shopping-line">
        <div><div class="shopping-name">${escapeHtml(ingredientNames[ing]||p.product_name)}</div>
        <div class="shopping-meta">${escapeHtml(p.product_name)} · ${escapeHtml(p.package_size||"")}</div></div>
        <div class="shopping-price"><strong>${pr?money(pr.value):"Price not verified"}</strong></div>
      </div>`;
    }).join("");
    totalEl.textContent=priced ? `Selected products subtotal: ${money(total)}${priced<selectedIds.length?" · some prices not verified":""}` : "Selected products subtotal: price pending";
  }catch(err){
    wrap.innerHTML='<div class="small">Selected product pricing could not be loaded.</div>';
    totalEl.textContent="";
  }
}

async function loadProductChoices(){
  try{
    const [productsResult,priceResult]=await Promise.all([apiJsonp("products"),apiJsonp("prices")]);
    renderChoiceGroups((productsResult.data||[]).filter(p=>p.active!==false),priceResult.data||[]);
  }catch(err){document.getElementById("choiceGroups").innerHTML='<div class="small">Product choices could not be loaded right now.</div>';console.warn("Product choices:",err)}
}

document.addEventListener("DOMContentLoaded",()=>{
  // Each page initializes only the modules it actually contains.
  if(document.querySelectorAll("input[data-g]").length) loadChecks();
  const notes=document.getElementById("notesBox");
  if(notes) notes.value=localStorage.getItem(NOTEKEY)||"";
  if(document.getElementById("apiStatus")) loadLiveKitchenData();
  if(document.getElementById("choiceGroups")) loadProductChoices();
  if(document.getElementById("selectedShoppingItems")) setTimeout(updateSelectedShopping,100);
  if(document.getElementById("cartItems")) loadWeeklyCart();
  // Advanced Kitchen 2.0 modules are hydrated by loadCompleteData on window load.
});



/* Kitchen 2.0 complete local layers */
const HISTORY_KEY='joe-jenny-spending-history';
const HOUSEHOLD_KEY='joe-jenny-household-prefs';
const RATINGS_KEY='joe-jenny-recipe-ratings';
const NEXT_WEEK_KEY='joe-jenny-next-week';
let completeProducts=[], completePrices=[], completeIngredients=[], completeAlternatives=[], completeRecipes=[];
let completeWeeklyMeals=[];

function localJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch(e){return fallback}}
function saveJSON(key,val){localStorage.setItem(key,JSON.stringify(val))}
function fmtMoney(v){return Number.isFinite(Number(v))?'$'+Number(v).toFixed(2):'—'}
function productPriceLocal(productId){const rows=completePrices.filter(x=>String(x.product_id)===String(productId));if(!rows.length)return null;rows.sort((a,b)=>String(b.date_checked).localeCompare(String(a.date_checked)));const r=rows[0];return Number(r.sale_price)||Number(r.regular_price)||null}
function productName(p){return p.product_name||p.name||p.brand||p.product_id}
function ingredientName(id){const x=completeIngredients.find(i=>String(i.ingredient_id)===String(id));return x?x.name:id}
function recipeById(id){return completeRecipes.find(r=>String(r.recipe_id)===String(id))}

async function loadCompleteData(){
  try{
    const [pr,pc,ing,alt,rec,wm]=await Promise.all(['products','prices','ingredients','alternatives','recipes','weekly_meals'].map(apiJsonp));
    completeProducts=pr.data||[];completePrices=pc.data||[];completeIngredients=ing.data||[];completeAlternatives=alt.data||[];completeRecipes=rec.data||[];completeWeeklyMeals=wm.data||[];
    renderAlternatives();renderRatings();loadHouseholdPrefs();renderNextWeek();renderSpending();
  }catch(e){
    ['alternativeCatalog','recipeRatings','plannerGrid','spendingHistory'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='<p class="small">Kitchen database is unavailable right now. Existing local data is still preserved on this device.</p>'});
  }
}

function renderSpending(){
  const history=localJSON(HISTORY_KEY,[]), state=loadShoppingTripState();
  const rows=state.rows||[]; let est=0,actual=0,entered=0,purchased=0;
  rows.forEach(r=>{if(!r.haveIt){est+=Number(r.estimatedCost)||0}if(r.purchased){purchased++;const a=Number(r.actualPrice);if(Number.isFinite(a)){actual+=a;entered++}}});
  const k=document.getElementById('spendingKpis'); if(!k)return;
  k.innerHTML='<div class="cart-kpi"><span>Estimated</span><strong>'+fmtMoney(est)+'</strong></div><div class="cart-kpi"><span>Actual entered</span><strong>'+fmtMoney(actual)+'</strong></div><div class="cart-kpi"><span>Difference</span><strong>'+fmtMoney(entered?actual-est:null)+'</strong></div><div class="cart-kpi"><span>Purchased</span><strong>'+purchased+'/'+rows.filter(r=>!r.haveIt).length+'</strong></div>';
  const wrap=document.getElementById('spendingHistory');
  if(!history.length){wrap.innerHTML='<p class="small">No saved weekly snapshots yet. Finish a shopping trip, enter actual prices, then save the week.</p>';return}
  wrap.innerHTML='<div class="history-row head"><div>Saved week</div><div>Estimated</div><div>Actual</div><div>Difference</div></div>'+history.slice().reverse().map(h=>'<div class="history-row"><div>'+escapeHtml(h.label)+'</div><div>'+fmtMoney(h.estimated)+'</div><div>'+fmtMoney(h.actual)+'</div><div>'+fmtMoney(h.actual-h.estimated)+'</div></div>').join('');
}
function saveSpendingSnapshot(){
  const state=loadShoppingTripState(), rows=state.rows||[];let estimated=0,actual=0,hasActual=false;
  rows.forEach(r=>{if(!r.haveIt){estimated+=Number(r.estimatedCost)||0}if(r.purchased&&Number.isFinite(Number(r.actualPrice))){actual+=Number(r.actualPrice);hasActual=true}});
  if(!hasActual){alert('Enter at least one actual purchase price first.');return}
  const hist=localJSON(HISTORY_KEY,[]);const label=new Date().toLocaleDateString();hist.push({label,estimated,actual});saveJSON(HISTORY_KEY,hist.slice(-20));renderSpending();
}
function clearSpendingHistory(){if(confirm('Clear saved spending history on this device?')){localStorage.removeItem(HISTORY_KEY);renderSpending()}}

function renderAlternatives(){
  const sel=document.getElementById('alternativeIngredient'), search=(document.getElementById('alternativeSearch')?.value||'').toLowerCase();if(!sel)return;
  const ids=[...new Map(completeProducts.map(p=>[p.ingredient_id,p])).keys()];const current=sel.value;
  sel.innerHTML='<option value="">All ingredients</option>'+ids.map(id=>'<option value="'+escapeHtml(id)+'">'+escapeHtml(ingredientName(id))+'</option>').join('');sel.value=current;
  const rows=completeProducts.filter(p=>(!sel.value||String(p.ingredient_id)===sel.value)&&(!search||[p.product_name,p.brand,ingredientName(p.ingredient_id)].join(' ').toLowerCase().includes(search)));
  const wrap=document.getElementById('alternativeCatalog');
  if(!rows.length){wrap.innerHTML='<p class="small">No products match this filter.</p>';return}
  const groups={};rows.forEach(p=>(groups[p.ingredient_id]??=[]).push(p));
  wrap.innerHTML=Object.entries(groups).map(([id,ps])=>'<div class="alt-row"><div class="alt-head"><div class="alt-product">'+escapeHtml(ingredientName(id))+'</div><span class="trip-badge">'+ps.length+' choice'+(ps.length===1?'':'s')+'</span></div>'+ps.map(p=>{
    const rel=completeAlternatives.find(a=>(String(a.product_id)===String(p.product_id)||String(a.alternative_product_id)===String(p.product_id))&&String(a.active).toLowerCase()!=='false');
    const bits=[p.brand,p.package_size].filter(Boolean).join(' · '); const price=productPriceLocal(p.product_id); const nutrition=[p.calories?('cal '+p.calories):'',p.protein_g?('protein '+p.protein_g+'g'):'',p.sodium_mg?('sodium '+p.sodium_mg+'mg'): ''].filter(Boolean).join(' · ');
    return '<div style="margin-top:10px;padding-left:12px"><div><strong>'+escapeHtml(productName(p))+'</strong> <span class="small">'+escapeHtml(bits)+'</span></div><div class="alt-meta">'+(price!==null?fmtMoney(price):'Price not verified')+(nutrition?' · '+escapeHtml(nutrition):'')+'</div>'+(rel?'<div class="alt-reason">'+escapeHtml(rel.reason||rel.reason_type||'Alternative available')+'</div>':'')+'</div>'
  }).join('')+'</div>').join('');
}

function renderRatings(){
  const wrap=document.getElementById('recipeRatings');if(!wrap)return;const r=localJSON(RATINGS_KEY,{});const active=completeRecipes.filter(x=>String(x.active).toLowerCase()!=='false');
  wrap.innerHTML=active.map(x=>{const v=r[x.recipe_id]||{};return `<div class="rating-row"><div><div class="rating-name">${escapeHtml(x.recipe_name)}</div><div class="small">${escapeHtml(x.cuisine||'')}</div></div><select onchange="setRecipeRating('${x.recipe_id}',this.value)"><option value="">Not rated</option><option value="1" ${v.rating==1?'selected':''}>1 — skip</option><option value="2" ${v.rating==2?'selected':''}>2 — change</option><option value="3" ${v.rating==3?'selected':''}>3 — okay</option><option value="4" ${v.rating==4?'selected':''}>4 — liked</option><option value="5" ${v.rating==5?'selected':''}>5 — loved</option></select><label title="Make again"><input type="checkbox" ${v.makeAgain?'checked':''} onchange="setRecipeMakeAgain('${x.recipe_id}',this.checked)"> again</label></div>`}).join('');
}
function setRecipeRating(id,val){const r=localJSON(RATINGS_KEY,{});r[id]=r[id]||{};r[id].rating=val?Number(val):null;saveJSON(RATINGS_KEY,r);}
function setRecipeMakeAgain(id,val){const r=localJSON(RATINGS_KEY,{});r[id]=r[id]||{};r[id].makeAgain=!!val;saveJSON(RATINGS_KEY,r);}
function loadHouseholdPrefs(){const p=localJSON(HOUSEHOLD_KEY,{budget:'balanced',variety:'high',leftovers:'high',specialty:'low'});['Budget','Variety','Leftovers','Specialty'].forEach(k=>{const el=document.getElementById('pref'+k);if(el)el.value=p[k.toLowerCase()]||el.value})}
function saveHouseholdPrefs(){const p={budget:prefBudget.value,variety:prefVariety.value,leftovers:prefLeftovers.value,specialty:prefSpecialty.value};saveJSON(HOUSEHOLD_KEY,p);document.getElementById('prefStatus').textContent=' Saved on this device.'}

function plannerRecipeOptions(selected){return '<option value="">— choose dinner —</option>'+completeRecipes.filter(x=>String(x.active).toLowerCase()!=='false').map(r=>'<option value="'+escapeHtml(r.recipe_id)+'" '+(r.recipe_id===selected?'selected':'')+'>'+escapeHtml(r.recipe_name)+'</option>').join('')}
function renderNextWeek(){
 const wrap=document.getElementById('plannerGrid');if(!wrap||!completeRecipes.length)return;const plan=localJSON(NEXT_WEEK_KEY,{});const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 wrap.innerHTML=days.map((d,i)=>{const v=plan[d]||'';const lunch=i&&plan[days[i-1]]?'Leftovers from '+days[i-1]+' dinner':'Flexible / planned lunch';return '<div class="planner-cell"><div class="dayname">'+d+'</div><select data-planner-day="'+d+'" onchange="updatePlanner()">'+plannerRecipeOptions(v)+'</select><div class="lunch">'+lunch+'</div></div>'}).join('');updatePlannerSummary();
}
function updatePlanner(){const p={};document.querySelectorAll('[data-planner-day]').forEach(s=>p[s.dataset.plannerDay]=s.value);saveJSON(NEXT_WEEK_KEY,p);updatePlannerSummary()}
function updatePlannerSummary(){const el=document.getElementById('plannerSummary');if(!el)return;const p=localJSON(NEXT_WEEK_KEY,{});const ids=Object.values(p).filter(Boolean);const names=ids.map(id=>recipeById(id)?.recipe_name).filter(Boolean);const cuisines=ids.map(id=>recipeById(id)?.cuisine).filter(Boolean);el.textContent=names.length+' dinner slots selected · '+new Set(cuisines).size+' cuisine styles represented.'}
function generateNextWeek(){
 const ratings=localJSON(RATINGS_KEY,{}), prefs=localJSON(HOUSEHOLD_KEY,{budget:'balanced',variety:'high',leftovers:'high',specialty:'low'});let candidates=completeRecipes.filter(r=>String(r.active).toLowerCase()!=='false');
 candidates=candidates.map(r=>({...r,score:(ratings[r.recipe_id]?.rating||3)+(ratings[r.recipe_id]?.makeAgain?1:0)})).sort((a,b)=>b.score-a.score);
 const chosen=[], cuisines=new Set();for(const r of candidates){if(chosen.length>=5)break;if(prefs.variety==='high'&&cuisines.has(r.cuisine))continue;chosen.push(r);cuisines.add(r.cuisine)}
 for(const r of candidates){if(chosen.length>=7)break;if(!chosen.includes(r))chosen.push(r)}
 const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];const plan={};days.forEach((d,i)=>plan[d]=chosen[i]?.recipe_id||'');saveJSON(NEXT_WEEK_KEY,plan);renderNextWeek();document.getElementById('plannerStatus').textContent=' Draft generated from your local feedback.';
}
function saveNextWeek(){updatePlanner();document.getElementById('plannerStatus').textContent=' Next week saved on this device.'}
function clearNextWeek(){localStorage.removeItem(NEXT_WEEK_KEY);renderNextWeek();document.getElementById('plannerStatus').textContent=' Draft cleared.'}

window.addEventListener('load',()=>{setTimeout(loadCompleteData,150);setTimeout(renderSpending,250);});
