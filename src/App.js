import { useState, useEffect, useRef } from "react";

// ─── Google Fonts ────────────────────────────────────────────────────────────
const FONT_LINK = document.createElement("link");
FONT_LINK.rel = "stylesheet";
FONT_LINK.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;0,9..144,900;1,9..144,400&family=DM+Sans:wght@400;500;600;700&display=swap";
document.head.appendChild(FONT_LINK);

// ─── Tokens ──────────────────────────────────────────────────────────────────
const C = {
  bg:        "#FAFAF8",
  surface:   "#FFFFFF",
  ink:       "#0F0E0C",
  mid:       "#4A4744",
  soft:      "#9C9894",
  hairline:  "#E8E4DF",
  // Signature gradient — coral to amber
  g1:        "#F04E23",   // deep coral
  g2:        "#F7821B",   // amber
  g3:        "#FBBA1C",   // golden
  // Flat accent
  accent:    "#F04E23",
  accentBg:  "#FEF0EB",
  // Status
  green:     "#0A8A5A",
  greenBg:   "#E8F7F0",
  // Platforms
  yt:        "#FF0000",
  ytBg:      "#FFF0F0",
  tt:        "#010101",
  ttBg:      "#F2F2F2",
  ig:        "#C13584",
  igBg:      "#FDF2F8",
  goog:      "#4285F4",
  googBg:    "#EFF6FF",
  fb:        "#1877F2",
  fbBg:      "#EBF3FF",
  lp:        "#F04E23",
  lpBg:      "#FEF0EB",
  // Shadows
  s1: "0 1px 4px rgba(15,14,12,.06)",
  s2: "0 4px 20px rgba(15,14,12,.08)",
  s3: "0 16px 48px rgba(15,14,12,.14)",
};

const GRAD = `linear-gradient(135deg, ${C.g1} 0%, ${C.g2} 55%, ${C.g3} 100%)`;
const GRAD_SUBTLE = `linear-gradient(135deg, ${C.g1}18 0%, ${C.g3}18 100%)`;

const PLAT = {
  youtube:   { label:"YouTube",    short:"YT", color:C.yt,   bg:C.ytBg   },
  tiktok:    { label:"TikTok",     short:"TT", color:C.tt,   bg:C.ttBg   },
  instagram: { label:"Instagram",  short:"IG", color:C.ig,   bg:C.igBg   },
  google:    { label:"Google",     short:"G",  color:C.goog, bg:C.googBg },
  facebook:  { label:"Facebook",   short:"FB", color:C.fb,   bg:C.fbBg   },
  lp:        { label:"LocalPulse", short:"LP", color:C.lp,   bg:C.lpBg   },
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const PLACES = [
  {
    id:1, name:"Ember & Smoke", cat:"BBQ Restaurant", addr:"142 Grillmaster Ave",
    dist:"0.3 km", rating:4.8, reviews:1243, price:"$$",
    tags:["Must Try","Trending"], emoji:"🥩", rank:1, checkins:342,
    color:"#F04E23", colorDark:"#C03000",
    coords:{x:"40%",y:"38%"},
    hero:"https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80",
    videos:[
      { pl:"youtube", who:"@FoodieExplorer", channel:"Foodie Explorer PH",
        followers:"892K", verified:true, stars:5,
        title:"I Found the BEST BBQ in the City",
        excerpt:"The smoke ring on this brisket is one of the best I've seen outside Texas. 18-hour smoke, house-made rubs — and the burnt ends are life-changing.",
        views:"2.4M", likes:"148K", comments:"3.2K", ago:"2 days ago",
        videoId:"dQw4w9WgXcQ", thumb:"https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600&q=80" },
      { pl:"tiktok", who:"@eats.with.maya", channel:"Eats with Maya",
        followers:"1.2M", verified:true, stars:5,
        title:"POV: discovering the best BBQ spot 🥩🔥",
        excerpt:"Went here on a whim and left completely obsessed. The ribs fall off the bone — and the sides? Just as incredible as the meat.",
        views:"8.7M", likes:"1.1M", comments:"14.2K", ago:"5 days ago",
        videoUrl:"https://tiktok.com", thumb:"https://images.unsplash.com/photo-1558030006-450675393462?w=600&q=80" },
    ],
    feed:[
      { pl:"google", who:"Sarah M.", stars:5, text:"Incredible BBQ experience. The brisket was fall-apart tender and staff were incredibly welcoming. The smoky aroma hits you the moment you walk in.", likes:"41", ago:"3d", verified:true },
      { pl:"google", who:"David K.", stars:4, text:"Consistently excellent over 3 visits. The ribs are the best in the area, no contest.", likes:"28", ago:"1w", verified:true },
      { pl:"lp", who:"Jamie L.", stars:5, text:"Tried the beef ribs special — incredible. Massive portions, great value. House-made sauces are a real standout.", likes:12, ago:"1d", checkin:true },
    ],
    deals:[
      { src:"Chase Sapphire", val:"10% back on first visit", icon:"💳", exp:"Jun 30" },
      { src:"@FoodieExplorer", val:"Free side · code EMBER10", icon:"🎁", exp:"May 15" },
    ],
    scores:{ youtube:4.9, instagram:4.7, tiktok:4.8, facebook:4.6, google:4.8, lp:5.0 },
  },
  {
    id:2, name:"Sakura Omakase", cat:"Japanese Restaurant", addr:"88 Blossom Street",
    dist:"0.7 km", rating:4.7, reviews:876, price:"$$$$",
    tags:["Hidden Gem","Book Ahead"], emoji:"🍣", rank:2, checkins:198,
    color:"#C13584", colorDark:"#8B1A5C",
    coords:{x:"60%",y:"24%"},
    hero:"https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80",
    videos:[
      { pl:"youtube", who:"@TokyoTableside", channel:"Tokyo Tableside",
        followers:"445K", verified:true, stars:5,
        title:"The Most Authentic Omakase Outside Japan",
        excerpt:"Chef Kenji trained in Tokyo for 8 years. The toro is sourced twice a week from Tsukiji — the most technically precise omakase I've had in Southeast Asia.",
        views:"980K", likes:"62K", comments:"1.8K", ago:"3 days ago",
        videoId:"dQw4w9WgXcQ", thumb:"https://images.unsplash.com/photo-1617196034183-421b4040ed20?w=600&q=80" },
      { pl:"tiktok", who:"@luxeats", channel:"Lux Eats",
        followers:"3.1M", verified:true, stars:5,
        title:"Spent ₱8,000 on dinner and zero regrets 🍣✨",
        excerpt:"12 courses, 2.5 hours, zero regrets. The wagyu course had the whole table silent. Book 3 weeks ahead — it sells out instantly.",
        views:"14.2M", likes:"2.3M", comments:"28.1K", ago:"1 week ago",
        videoUrl:"https://tiktok.com", thumb:"https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=600&q=80" },
    ],
    feed:[
      { pl:"google", who:"Hiroshi T.", stars:5, text:"Authentic omakase with the freshest fish I've had outside Japan. The chef's skill is evident in every single course.", likes:"63", ago:"2d", verified:true },
      { pl:"lp", who:"Kevin O.", stars:5, text:"Every course was a work of art. Chef came out to explain each dish personally. An absolutely unforgettable evening.", likes:21, ago:"4d", checkin:true },
    ],
    deals:[
      { src:"Amex Platinum", val:"$50 dining credit on $200+", icon:"💳", exp:"Dec 31" },
    ],
    scores:{ youtube:4.8, instagram:4.9, tiktok:4.5, facebook:4.6, google:4.7, lp:5.0 },
  },
  {
    id:3, name:"Neon Ramen Lab", cat:"Ramen Restaurant", addr:"7 Night Market Lane",
    dist:"1.1 km", rating:4.6, reviews:2108, price:"$",
    tags:["Late Night","Best Value"], emoji:"🍜", rank:3, checkins:611,
    color:"#7C3AED", colorDark:"#5B21B6",
    coords:{x:"28%",y:"55%"},
    hero:"https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&q=80",
    videos:[
      { pl:"tiktok", who:"@latenightmunchies", channel:"Late Night Munchies",
        followers:"5.8M", verified:true, stars:5,
        title:"The ₱350 ramen that's better than spots 3x the price",
        excerpt:"Tonkotsu broth that hits different at midnight. Open until 3am and under ₱350. This place deserves to blow up.",
        views:"31.4M", likes:"4.2M", comments:"52K", ago:"1 day ago",
        videoUrl:"https://tiktok.com", thumb:"https://images.unsplash.com/photo-1591814468924-caf88d1232e1?w=600&q=80" },
      { pl:"youtube", who:"@RamenRanker", channel:"Ramen Ranker",
        followers:"218K", verified:false, stars:5,
        title:"I Ranked Every Ramen in the City — #1 Will Surprise You",
        excerpt:"After 40+ ramen spots, Neon Ramen Lab takes the top spot. The broth takes 18 hours and you can taste every single one of them.",
        views:"412K", likes:"38K", comments:"920", ago:"4 days ago",
        videoId:"dQw4w9WgXcQ", thumb:"https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=600&q=80" },
    ],
    feed:[
      { pl:"google", who:"Anya P.", stars:5, text:"Best ramen I've had in the city. Rich complex broth, perfect noodles. Outstanding value at any price point.", likes:"87", ago:"1d", verified:true },
      { pl:"lp", who:"Sam T.", stars:5, text:"3am ramen run and this delivers every time. Black garlic tonkotsu — deeply savoury and warming.", likes:34, ago:"2d", checkin:true },
    ],
    deals:[
      { src:"Citi Double Cash", val:"2% back + $5 bonus", icon:"💳", exp:"Ongoing" },
      { src:"@latenightmunchies", val:"Free drink · code NEON", icon:"🎁", exp:"Apr 30" },
    ],
    scores:{ youtube:4.7, instagram:4.4, tiktok:4.9, facebook:4.5, google:4.6, lp:4.9 },
  },
  {
    id:4, name:"Groundwork Coffee", cat:"Specialty Café", addr:"23 Brew Street",
    dist:"0.5 km", rating:4.5, reviews:654, price:"$$",
    tags:["Work Friendly","Local Fav"], emoji:"☕", rank:4, checkins:289,
    color:"#92400E", colorDark:"#6B2F0A",
    coords:{x:"64%",y:"46%"},
    hero:"https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80",
    videos:[
      { pl:"youtube", who:"@dailybrewdiaries", channel:"Daily Brew Diaries",
        followers:"134K", verified:false, stars:5,
        title:"The Best Specialty Coffee in the City — Full Review",
        excerpt:"The Ethiopian single-origin pour over here is genuinely exceptional. They roast in-house and offer cupping sessions on weekends.",
        views:"88K", likes:"7.2K", comments:"340", ago:"2 days ago",
        videoId:"dQw4w9WgXcQ", thumb:"https://images.unsplash.com/photo-1511537190424-bbbab87ac5eb?w=600&q=80" },
    ],
    feed:[
      { pl:"google", who:"Tom H.", stars:5, text:"Exceptional single origin coffee, knowledgeable staff, relaxed atmosphere. My go-to for remote working days, without question.", likes:"32", ago:"4d", verified:true },
      { pl:"lp", who:"Chloe B.", stars:5, text:"Kenya AA pour over was phenomenal. Fast wifi and loads of plugs. The perfect work café.", likes:9, ago:"5d", checkin:true },
    ],
    deals:[{ src:"Loyalty Promo", val:"Free pastry with any large drink", icon:"🎁", exp:"May 1" }],
    scores:{ youtube:4.3, instagram:4.8, tiktok:4.6, facebook:4.4, google:4.6, lp:5.0 },
  },
  {
    id:5, name:"The Library Bar", cat:"Cocktail Bar", addr:"55 Oak & Bourbon Blvd",
    dist:"1.4 km", rating:4.4, reviews:432, price:"$$$",
    tags:["Date Night","Speakeasy"], emoji:"🍸", rank:5, checkins:167,
    color:"#065F46", colorDark:"#064E3B",
    coords:{x:"54%",y:"68%"},
    hero:"https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=800&q=80",
    videos:[
      { pl:"youtube", who:"@CocktailCraft", channel:"Cocktail Craft",
        followers:"307K", verified:true, stars:5,
        title:"Hidden Speakeasy Behind a Bookshelf — Full Review",
        excerpt:"You push a specific book and a door opens. The 'Last Chapter' — smoked whisky with dark cherry — is genuinely one of the top 10 cocktails I've had anywhere.",
        views:"1.1M", likes:"89K", comments:"2.4K", ago:"6 days ago",
        videoId:"dQw4w9WgXcQ", thumb:"https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&q=80" },
    ],
    feed:[
      { pl:"google", who:"Rebecca O.", stars:5, text:"One of the best-kept secrets in the city. The bartenders are true artists. Go for the seasonal cocktail menu.", likes:"55", ago:"2d", verified:true },
      { pl:"lp", who:"Daniel M.", stars:4, text:"Checked in on a Friday — atmosphere was electric. The 'Last Chapter' is as good as the reviews say. Always book ahead.", likes:15, ago:"1w", checkin:true },
    ],
    deals:[],
    scores:{ youtube:4.6, instagram:4.7, tiktok:4.1, facebook:4.3, google:4.7, lp:4.0 },
  },
];

const ME = { name:"Alex Rivera", handle:"@alexrivera", initials:"AR" };

// ─── Micro helpers ────────────────────────────────────────────────────────────
const css = (styles) => Object.entries(styles).map(([k,v])=>`${k.replace(/([A-Z])/g,'-$1').toLowerCase()}:${v}`).join(';');

function useAnimIn(delay=0) {
  const [on,setOn]=useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setOn(true),delay); return()=>clearTimeout(t); },[delay]);
  return on;
}

const Stars = ({ n, size=13 }) => (
  <span style={{letterSpacing:-1}}>
    {[1,2,3,4,5].map(i=>(
      <span key={i} style={{fontSize:size,color:i<=Math.round(n)?"#F59E0B":"#DDD6CA"}}>★</span>
    ))}
  </span>
);

const TapStars = ({ value, onChange }) => {
  const [hov,setHov]=useState(0);
  return (
    <div style={{display:"flex",gap:8}}>
      {[1,2,3,4,5].map(i=>(
        <button key={i}
          onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(0)}
          onClick={()=>onChange(i)}
          style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:38,color:i<=(hov||value)?"#F59E0B":"#DDD6CA",transition:"color .12s,transform .1s",transform:i<=(hov||value)?"scale(1.1)":"scale(1)"}}>★</button>
      ))}
    </div>
  );
};

const Chip = ({ label, color, bg, size="sm" }) => (
  <span style={{
    display:"inline-flex",alignItems:"center",
    fontSize:size==="sm"?10:12,fontWeight:600,
    color, background:bg,
    padding:size==="sm"?"2px 8px":"4px 12px",
    borderRadius:99,whiteSpace:"nowrap",letterSpacing:.2,
  }}>{label}</span>
);

const PlatChip = ({ pl, sm=true }) => {
  const m = PLAT[pl]||PLAT.lp;
  return <Chip label={sm?m.short:m.label} color={m.color} bg={m.bg} size={sm?"sm":"md"}/>;
};

const ScoreRow = ({ pl, score }) => {
  const m = PLAT[pl]||PLAT.lp;
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
      <Chip label={m.label} color={m.color} bg={m.bg} size="sm"/>
      <div style={{flex:1,height:4,background:C.hairline,borderRadius:99,overflow:"hidden"}}>
        <div style={{width:`${(score/5)*100}%`,height:"100%",background:m.color,borderRadius:99,transition:"width .9s cubic-bezier(.22,1,.36,1)"}}/>
      </div>
      <span style={{fontSize:13,fontWeight:700,color:C.mid,width:28,textAlign:"right",fontFamily:"'Fraunces',serif"}}>{score.toFixed(1)}</span>
    </div>
  );
};

// ─── Map pin ─────────────────────────────────────────────────────────────────
const Pin = ({ place, active, onTap }) => (
  <button onClick={onTap} style={{
    position:"absolute",left:place.coords.x,top:place.coords.y,
    transform:"translate(-50%,-100%)",
    background:"none",border:"none",padding:0,cursor:"pointer",
    zIndex:active?30:10,
    transition:"transform .2s cubic-bezier(.34,1.56,.64,1)",
    filter:active?"drop-shadow(0 6px 16px rgba(240,78,35,.5))":"drop-shadow(0 2px 6px rgba(0,0,0,.18))",
  }}>
    <div style={{
      width:active?52:40,height:active?52:40,
      borderRadius:"50% 50% 50% 0",transform:"rotate(-45deg)",
      background:active?GRAD:place.color,
      border:"3px solid #fff",
      display:"flex",alignItems:"center",justifyContent:"center",
      transition:"all .2s cubic-bezier(.34,1.56,.64,1)",
    }}>
      <span style={{transform:"rotate(45deg)",fontSize:active?22:17}}>{place.emoji}</span>
    </div>
  </button>
);

// ─── Place card (horizontal scroll strip) ────────────────────────────────────
const PlaceCard = ({ place, onOpen, visited, index }) => {
  const anim = useAnimIn(index*60);
  return (
    <div onClick={onOpen} style={{
      minWidth:220,borderRadius:20,overflow:"hidden",
      background:C.surface,
      boxShadow:C.s2,cursor:"pointer",flexShrink:0,
      border:`1px solid ${C.hairline}`,
      opacity:anim?1:0,
      transform:anim?"translateY(0)":"translateY(12px)",
      transition:"opacity .4s ease, transform .4s cubic-bezier(.22,1,.36,1)",
    }}>
      {/* Hero image */}
      <div style={{position:"relative",height:130,overflow:"hidden",background:"#eee"}}>
        <img src={place.hero} alt={place.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
          onError={e=>{e.target.style.display="none";}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to top, rgba(0,0,0,.5) 0%, transparent 60%)"}}/>
        {/* Rank badge */}
        <div style={{
          position:"absolute",top:10,left:10,
          width:28,height:28,borderRadius:"50%",
          background:place.rank<=3?"#fff":C.surface,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:place.rank<=3?15:10,fontWeight:900,
          boxShadow:C.s1,
        }}>
          {place.rank===1?"🥇":place.rank===2?"🥈":place.rank===3?"🥉":`#${place.rank}`}
        </div>
        {visited&&(
          <div style={{position:"absolute",top:10,right:10}}>
            <Chip label="✓ Visited" color={C.green} bg={C.greenBg}/>
          </div>
        )}
        {/* Video badges */}
        <div style={{position:"absolute",bottom:8,left:10,display:"flex",gap:4}}>
          {place.videos.some(v=>v.pl==="youtube")&&<Chip label={`▶ ${place.videos.filter(v=>v.pl==="youtube").length}`} color="#fff" bg="rgba(255,0,0,.85)"/>}
          {place.videos.some(v=>v.pl==="tiktok")&&<Chip label={`♪ ${place.videos.filter(v=>v.pl==="tiktok").length}`} color="#fff" bg="rgba(0,0,0,.7)"/>}
        </div>
      </div>
      <div style={{padding:"12px 14px 14px"}}>
        <div style={{fontSize:15,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif",marginBottom:2,letterSpacing:-.3}}>{place.name}</div>
        <div style={{fontSize:11,color:C.soft,marginBottom:8}}>{place.cat} · {place.dist} · {place.price}</div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <Stars n={place.rating} size={11}/>
          <span style={{fontSize:12,fontWeight:700,color:"#F59E0B",fontFamily:"'Fraunces',serif"}}>{place.rating.toFixed(1)}</span>
          <span style={{fontSize:11,color:C.soft}}>({place.reviews.toLocaleString()})</span>
        </div>
      </div>
    </div>
  );
};

// ─── Video card ───────────────────────────────────────────────────────────────
const VideoCard = ({ video, onWatch }) => {
  const isYT=video.pl==="youtube", isTT=video.pl==="tiktok", isIG=video.pl==="instagram";
  const m=PLAT[video.pl]||PLAT.youtube;
  const [imgOk,setImgOk]=useState(true);

  return (
    <div style={{borderRadius:20,overflow:"hidden",marginBottom:16,background:C.surface,border:`1px solid ${C.hairline}`,boxShadow:C.s2}}>
      {/* Thumbnail */}
      <div onClick={()=>onWatch(video)} style={{
        position:"relative",cursor:"pointer",
        aspectRatio:"16/9",overflow:"hidden",
        background:isYT?"#111":isTT?"#1a1a1a":"linear-gradient(135deg,#833ab4,#fd1d1d)",
      }}>
        {video.thumb&&imgOk?(
          <img src={video.thumb} alt={video.title} onError={()=>setImgOk(false)}
            style={{width:"100%",height:"100%",objectFit:"cover",opacity:.88}}/>
        ):(
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:48,opacity:.6}}>{isTT?"♪":"▶"}</span>
          </div>
        )}
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.45) 0%,transparent 60%)"}}/>
        {/* Play button */}
        <div style={{
          position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          width:56,height:56,borderRadius:"50%",
          background:"rgba(255,255,255,.95)",
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:"0 4px 20px rgba(0,0,0,.25)",
        }}>
          <span style={{fontSize:20,marginLeft:3,color:m.color}}>▶</span>
        </div>
        {/* Stats overlay */}
        <div style={{position:"absolute",bottom:10,left:12,right:12,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div style={{background:"rgba(0,0,0,.65)",borderRadius:8,padding:"3px 9px",fontSize:11,color:"#fff",fontWeight:600}}>
            👁 {video.views}
          </div>
          <div style={{background:m.color,borderRadius:8,padding:"3px 9px",fontSize:10,color:"#fff",fontWeight:700}}>
            {isYT?"YouTube":isTT?"TikTok":"Instagram"}
          </div>
        </div>
      </div>

      <div style={{padding:"16px"}}>
        {/* Creator */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <div style={{
            width:38,height:38,borderRadius:"50%",flexShrink:0,
            background:m.color,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:15,fontWeight:800,color:"#fff",
          }}>{video.who.replace("@","").charAt(0).toUpperCase()}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:13,fontWeight:700,color:C.ink}}>{video.who}</span>
              {video.verified&&<span style={{fontSize:10,fontWeight:700,color:m.color,background:m.bg,padding:"1px 6px",borderRadius:99}}>✓</span>}
            </div>
            <div style={{fontSize:11,color:C.soft}}>{video.followers} followers · {video.ago}</div>
          </div>
        </div>

        {/* Title */}
        <div style={{fontSize:14,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif",lineHeight:1.4,marginBottom:8}}>{video.title}</div>

        {/* Excerpt */}
        <p style={{fontSize:13,color:C.mid,lineHeight:1.7,margin:"0 0 12px"}}>{video.excerpt}</p>

        {/* Stars */}
        <div style={{marginBottom:12}}><Stars n={video.stars} size={14}/></div>

        {/* Stats row */}
        <div style={{display:"flex",borderTop:`1px solid ${C.hairline}`,paddingTop:12,marginBottom:14}}>
          {[{icon:"♥",val:video.likes,label:"likes"},{icon:"💬",val:video.comments,label:"comments"}].map((s,i)=>(
            <div key={i} style={{flex:1,textAlign:"center",borderRight:i<1?`1px solid ${C.hairline}`:"none"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif"}}>{s.val}</div>
              <div style={{fontSize:10,color:C.soft}}>{s.icon} {s.label}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button onClick={()=>onWatch(video)} style={{
          width:"100%",padding:"13px",borderRadius:12,
          background:m.bg,border:`1.5px solid ${m.color}40`,
          color:m.color,fontSize:13,fontWeight:700,
          cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
          display:"flex",alignItems:"center",justifyContent:"center",gap:6,
          transition:"all .15s",
        }}>
          {isYT?"▶  Watch Video":isTT?"♪  Watch on TikTok →":"◈  View on Instagram →"}
        </button>
      </div>
    </div>
  );
};

// ─── Text review card ─────────────────────────────────────────────────────────
const ReviewCard = ({ rv }) => {
  const m=PLAT[rv.pl]||PLAT.lp;
  return (
    <div style={{
      borderRadius:16,padding:"16px",marginBottom:10,
      background:rv.pl==="lp"?"#FFF9F8":rv.pl==="google"?"#F4F8FF":C.surface,
      border:`1px solid ${rv.pl==="lp"?"#FCCFBF":rv.pl==="google"?"#BFDBFE":C.hairline}`,
      boxShadow:C.s1,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <Chip label={m.label} color={m.color} bg={m.bg}/>
        <span style={{fontSize:13,fontWeight:600,color:C.ink}}>{rv.who}</span>
        {rv.checkin&&<Chip label="📍 Checked In" color={C.green} bg={C.greenBg}/>}
        {rv.verified&&<Chip label="✓ Verified" color={C.green} bg={C.greenBg}/>}
        <span style={{marginLeft:"auto",fontSize:11,color:C.soft}}>{rv.ago}</span>
      </div>
      <Stars n={rv.stars} size={12}/>
      <p style={{fontSize:13,color:C.mid,lineHeight:1.7,margin:"8px 0 8px"}}>{rv.text}</p>
      <span style={{fontSize:11,color:C.soft}}>♥ {rv.likes} likes</span>
    </div>
  );
};

// ─── Video player overlay ─────────────────────────────────────────────────────
const VideoPlayer = ({ video, onClose }) => {
  const isYT=video.pl==="youtube";
  const m=PLAT[video.pl]||PLAT.youtube;
  return (
    <div style={{position:"absolute",inset:0,zIndex:400,background:"#0a0a0a",display:"flex",flexDirection:"column"}}>
      {/* Top bar */}
      <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <button onClick={onClose} style={{width:34,height:34,borderRadius:"50%",background:"rgba(255,255,255,.1)",border:"none",color:"#fff",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{video.who} <span style={{color:m.color}}>✓</span></div>
          <div style={{fontSize:11,color:"#888"}}>{video.followers} followers</div>
        </div>
        <Chip label={m.label} color={m.color} bg={`${m.color}30`}/>
      </div>

      {/* Player */}
      {isYT&&video.videoId?(
        <div style={{position:"relative",paddingBottom:"56.25%",background:"#000",flexShrink:0}}>
          <iframe
            src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&playsinline=1`}
            style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none"}}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen title={video.title}
          />
        </div>
      ):(
        <div style={{flexShrink:0,aspectRatio:"16/9",background:"linear-gradient(135deg,#1a1a1a,#2d2d2d)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
          <div style={{fontSize:52,opacity:.7}}>{video.pl==="tiktok"?"♪":"◈"}</div>
          <button onClick={()=>window.open(video.videoUrl,"_blank")} style={{
            padding:"14px 28px",borderRadius:12,border:"none",
            background:video.pl==="tiktok"?"#fff":"linear-gradient(135deg,#833ab4,#fd1d1d)",
            color:video.pl==="tiktok"?"#010101":"#fff",
            fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
          }}>
            {video.pl==="tiktok"?"♪  Open TikTok →":"◈  Open Instagram →"}
          </button>
        </div>
      )}

      {/* Info */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 16px 32px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <Stars n={video.stars} size={15}/>
          <span style={{fontSize:12,color:"#888"}}>{video.ago}</span>
        </div>
        <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:"'Fraunces',serif",lineHeight:1.4,marginBottom:10}}>{video.title}</div>
        <p style={{fontSize:13,color:"#aaa",lineHeight:1.75,margin:"0 0 16px"}}>{video.excerpt}</p>
        <div style={{display:"flex",gap:0,background:"rgba(255,255,255,.06)",borderRadius:12,overflow:"hidden",marginBottom:16}}>
          {[{icon:"👁",val:video.views,l:"views"},{icon:"♥",val:video.likes,l:"likes"},{icon:"💬",val:video.comments,l:"comments"}].map((s,i)=>(
            <div key={i} style={{flex:1,textAlign:"center",padding:"14px 8px",borderRight:i<2?"1px solid rgba(255,255,255,.08)":"none"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#fff",fontFamily:"'Fraunces',serif"}}>{s.val}</div>
              <div style={{fontSize:10,color:"#666"}}>{s.icon} {s.l}</div>
            </div>
          ))}
        </div>
        {isYT&&video.videoId&&(
          <button onClick={()=>window.open(`https://youtube.com/watch?v=${video.videoId}`,"_blank")} style={{width:"100%",padding:"13px",borderRadius:12,background:"rgba(255,0,0,.2)",border:"1.5px solid rgba(255,0,0,.4)",color:"#ff6b6b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
            ▶  Open on YouTube
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Check-in sheet ───────────────────────────────────────────────────────────
const CheckInSheet = ({ place, onClose, onDone }) => {
  const [step,setStep]=useState("confirm");
  const [stars,setStars]=useState(0);
  const [txt,setTxt]=useState("");
  const [busy,setBusy]=useState(false);
  const LABELS=["","Poor","Fair","Good","Great","Excellent!"];

  const submit=async()=>{
    if(!stars||!txt.trim())return;
    setBusy(true);
    await new Promise(r=>setTimeout(r,800));
    onDone({stars,txt});
    setStep("done");
    setBusy(false);
  };

  return (
    <div style={{position:"absolute",inset:0,zIndex:300,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(15,14,12,.5)",backdropFilter:"blur(6px)"}}/>
      <div style={{
        position:"relative",background:C.surface,
        borderRadius:"28px 28px 0 0",
        boxShadow:"0 -12px 60px rgba(15,14,12,.2)",
        maxHeight:"92%",overflowY:"auto",
        animation:"slideUp .35s cubic-bezier(.22,1,.36,1)",
      }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",paddingTop:14}}>
          <div style={{width:44,height:4,borderRadius:2,background:C.hairline}}/>
        </div>

        {/* Place banner */}
        <div style={{margin:"12px 16px 0",borderRadius:20,overflow:"hidden",position:"relative",height:100}}>
          <img src={place.hero} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to right, rgba(0,0,0,.6) 0%, rgba(0,0,0,.2) 100%)",display:"flex",alignItems:"center",padding:"0 16px"}}>
            <span style={{fontSize:32,marginRight:12}}>{place.emoji}</span>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:"#fff",fontFamily:"'Fraunces',serif"}}>{place.name}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>{place.addr}</div>
            </div>
          </div>
          <button onClick={onClose} style={{position:"absolute",top:10,right:10,width:30,height:30,borderRadius:"50%",background:"rgba(0,0,0,.4)",border:"none",color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        <div style={{padding:"22px 20px 0"}}>
          {step==="confirm"&&(
            <>
              <div style={{textAlign:"center",marginBottom:24}}>
                <div style={{fontSize:52,marginBottom:12}}>📍</div>
                <div style={{fontSize:20,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif",marginBottom:8}}>Check in here?</div>
                <div style={{fontSize:14,color:C.mid,lineHeight:1.7}}>Confirm you're at <strong style={{color:C.ink}}>{place.name}</strong> and leave a review that counts toward the community score.</div>
              </div>
              <button onClick={()=>setStep("review")} style={{
                width:"100%",padding:"16px",borderRadius:16,border:"none",
                background:GRAD,color:"#fff",fontSize:15,fontWeight:700,
                cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
                boxShadow:"0 4px 20px rgba(240,78,35,.35)",marginBottom:10,
              }}>✓ Yes, I'm here — Check In</button>
              <button onClick={onClose} style={{width:"100%",padding:"14px",borderRadius:16,background:"none",border:"none",color:C.soft,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginBottom:20}}>Cancel</button>
            </>
          )}

          {step==="review"&&(
            <>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                <Chip label="📍 Checked in" color={C.green} bg={C.greenBg}/>
                <PlatChip pl="lp" sm={false}/>
              </div>
              <div style={{fontSize:18,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif",marginBottom:4}}>Your Review</div>
              <div style={{fontSize:13,color:C.soft,marginBottom:20}}>Your review updates the live aggregate score — be honest!</div>

              <div style={{marginBottom:22}}>
                <div style={{fontSize:11,fontWeight:600,color:C.soft,textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Rating</div>
                <TapStars value={stars} onChange={setStars}/>
                {stars>0&&(
                  <div style={{fontSize:16,fontWeight:700,color:"#F59E0B",fontFamily:"'Fraunces',serif",marginTop:8}}>{LABELS[stars]}</div>
                )}
              </div>

              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:600,color:C.soft,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Your Take</div>
                <textarea value={txt} onChange={e=>setTxt(e.target.value.slice(0,400))}
                  placeholder={`What did you think of ${place.name}?`} rows={4}
                  style={{width:"100%",boxSizing:"border-box",padding:"14px",borderRadius:14,border:`1.5px solid ${C.hairline}`,background:C.bg,color:C.ink,fontSize:14,fontFamily:"'DM Sans',sans-serif",lineHeight:1.65,resize:"none",outline:"none",transition:"border .15s"}}
                  onFocus={e=>e.target.style.borderColor=C.accent}
                  onBlur={e=>e.target.style.borderColor=C.hairline}/>
                <div style={{fontSize:11,color:C.soft,textAlign:"right",marginTop:4}}>{txt.length}/400</div>
              </div>

              <button onClick={submit} disabled={!stars||!txt.trim()||busy} style={{
                width:"100%",padding:"16px",borderRadius:16,border:"none",
                background:stars&&txt.trim()?GRAD:"#E8E4DF",
                color:stars&&txt.trim()?"#fff":C.soft,
                fontSize:15,fontWeight:700,cursor:stars&&txt.trim()?"pointer":"not-allowed",
                fontFamily:"'DM Sans',sans-serif",transition:"all .2s",
                boxShadow:stars&&txt.trim()?"0 4px 20px rgba(240,78,35,.3)":"none",marginBottom:10,
              }}>{busy?"Posting…":"Post Review →"}</button>
              <button onClick={()=>setStep("confirm")} style={{width:"100%",padding:"13px",borderRadius:16,background:"none",border:"none",color:C.soft,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginBottom:20}}>← Back</button>
            </>
          )}

          {step==="done"&&(
            <div style={{textAlign:"center",paddingBottom:20}}>
              <div style={{width:76,height:76,borderRadius:"50%",background:C.greenBg,fontSize:36,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>✓</div>
              <div style={{fontSize:22,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif",marginBottom:8}}>Review Posted!</div>
              <div style={{fontSize:14,color:C.mid,lineHeight:1.7,marginBottom:20}}>Your check-in review is now live on<br/><strong style={{color:C.ink}}>{place.name}</strong> and has updated its score.</div>
              <button onClick={onClose} style={{padding:"15px 40px",borderRadius:16,background:GRAD,border:"none",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",boxShadow:"0 4px 20px rgba(240,78,35,.3)"}}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Detail sheet ─────────────────────────────────────────────────────────────
const DetailSheet = ({ place, visited, onCheckIn, onClose, onWatchVideo }) => {
  const [tab,setTab]=useState("videos");
  const tabs=[
    {k:"videos",label:"Videos",count:place.videos.length},
    {k:"reviews",label:"Reviews",count:place.feed.length},
    {k:"scores",label:"Scores"},
    {k:"deals",label:"Deals",count:place.deals.length},
  ];

  return (
    <div style={{position:"absolute",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(15,14,12,.4)",backdropFilter:"blur(4px)"}}/>
      <div style={{
        position:"relative",background:C.bg,
        borderRadius:"28px 28px 0 0",height:"88%",
        display:"flex",flexDirection:"column",
        boxShadow:"0 -12px 60px rgba(15,14,12,.18)",
        animation:"slideUp .35s cubic-bezier(.22,1,.36,1)",
      }}>
        {/* Drag handle */}
        <div style={{display:"flex",justifyContent:"center",paddingTop:12,flexShrink:0}}>
          <div style={{width:44,height:4,borderRadius:2,background:C.hairline}}/>
        </div>

        {/* Hero image strip */}
        <div style={{margin:"10px 16px 0",borderRadius:22,overflow:"hidden",position:"relative",height:180,flexShrink:0}}>
          <img src={place.hero} alt={place.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
            onError={e=>e.target.style.background=place.color}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top, rgba(0,0,0,.65) 0%, rgba(0,0,0,.1) 60%)"}}/>

          {/* Close */}
          <button onClick={onClose} style={{position:"absolute",top:12,right:12,width:32,height:32,borderRadius:"50%",background:"rgba(0,0,0,.4)",border:"none",color:"#fff",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>

          {/* Rank */}
          <div style={{position:"absolute",top:12,left:12,width:34,height:34,borderRadius:"50%",background:"rgba(255,255,255,.9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900}}>
            {place.rank===1?"🥇":place.rank===2?"🥈":place.rank===3?"🥉":`#${place.rank}`}
          </div>

          {/* Bottom info overlay */}
          <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px"}}>
            <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
              {place.videos.some(v=>v.pl==="youtube")&&<Chip label={`▶ ${place.videos.filter(v=>v.pl==="youtube").length} YouTube`} color="#fff" bg="rgba(255,0,0,.8)"/>}
              {place.videos.some(v=>v.pl==="tiktok")&&<Chip label={`♪ ${place.videos.filter(v=>v.pl==="tiktok").length} TikTok`} color="#fff" bg="rgba(0,0,0,.7)"/>}
              {visited&&<Chip label="✓ Visited" color={C.green} bg={C.greenBg}/>}
            </div>
            <div style={{fontSize:22,fontWeight:700,color:"#fff",fontFamily:"'Fraunces',serif",letterSpacing:-.5}}>{place.name}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.8)",marginTop:2}}>{place.cat} · {place.addr} · {place.price}</div>
          </div>
        </div>

        {/* Rating + check-in */}
        <div style={{margin:"12px 16px 0",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <Stars n={place.rating} size={15}/>
            <span style={{fontSize:18,fontWeight:700,color:"#F59E0B",fontFamily:"'Fraunces',serif"}}>{place.rating.toFixed(1)}</span>
            <span style={{fontSize:12,color:C.soft}}>({place.reviews.toLocaleString()} reviews)</span>
            <span style={{fontSize:12,color:C.soft,marginLeft:"auto"}}>📍 {place.checkins.toLocaleString()} check-ins</span>
          </div>

          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {place.tags.map(t=><Chip key={t} label={t} color={C.accent} bg={C.accentBg}/>)}
          </div>

          <button onClick={onCheckIn} disabled={visited} style={{
            width:"100%",padding:"14px",borderRadius:14,border:"none",
            background:visited?C.greenBg:GRAD,
            border:visited?`1.5px solid #6EE7B7`:"none",
            color:visited?C.green:"#fff",
            fontSize:14,fontWeight:700,cursor:visited?"default":"pointer",
            fontFamily:"'DM Sans',sans-serif",
            boxShadow:visited?"none":"0 4px 16px rgba(240,78,35,.28)",
            display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            transition:"all .2s",
          }}>
            {visited?"✓ You've Checked In & Reviewed":"📍 Check In & Leave a Review"}
          </button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",margin:"14px 16px 0",background:C.hairline,borderRadius:14,padding:4,flexShrink:0}}>
          {tabs.map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)} style={{
              flex:1,padding:"9px 4px",borderRadius:10,fontSize:11,fontWeight:700,
              border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
              background:tab===t.k?C.surface:"transparent",
              color:tab===t.k?C.accent:C.soft,
              boxShadow:tab===t.k?C.s1:"none",
              transition:"all .2s cubic-bezier(.22,1,.36,1)",
              display:"flex",alignItems:"center",justifyContent:"center",gap:4,
            }}>
              {t.label}
              {t.count>0&&<span style={{fontSize:9,background:tab===t.k?C.accent:"transparent",color:tab===t.k?"#fff":C.soft,padding:"1px 5px",borderRadius:99}}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 16px 32px"}}>

          {tab==="videos"&&(
            <>
              <p style={{fontSize:13,color:C.soft,marginBottom:14,lineHeight:1.6}}>Real video reviews from content creators. YouTube plays in-app. TikTok & Instagram link out to the original post.</p>
              {place.videos.map((v,i)=><VideoCard key={i} video={v} onWatch={onWatchVideo}/>)}
              {place.videos.length===0&&<div style={{textAlign:"center",padding:"40px",color:C.soft}}><div style={{fontSize:40,marginBottom:8}}>🎬</div>No video reviews yet.</div>}
            </>
          )}

          {tab==="reviews"&&(
            <>
              <p style={{fontSize:13,color:C.soft,marginBottom:14}}>Written reviews from Google, Facebook, and LocalPulse check-ins.</p>
              {place.feed.map((rv,i)=><ReviewCard key={i} rv={rv}/>)}
            </>
          )}

          {tab==="scores"&&(
            <>
              <p style={{fontSize:13,color:C.soft,marginBottom:16}}>Weighted across 6 platforms, including video engagement signals.</p>
              {Object.entries(place.scores).map(([pl,sc])=><ScoreRow key={pl} pl={pl} score={sc}/>)}

              <div style={{padding:"18px",borderRadius:18,background:C.accentBg,border:`1px solid ${C.accent}30`,marginTop:4,marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:600,color:C.accent,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Overall Aggregate</div>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:6}}>
                  <span style={{fontSize:52,fontWeight:700,color:C.accent,fontFamily:"'Fraunces',serif",lineHeight:1}}>{place.rating.toFixed(1)}</span>
                  <span style={{fontSize:18,color:C.soft}}>/5</span>
                </div>
                <Stars n={place.rating} size={20}/>
                <div style={{fontSize:12,color:C.mid,marginTop:10}}>{place.reviews.toLocaleString()} reviews · {place.checkins.toLocaleString()} check-ins · {place.videos.length} video reviews</div>
              </div>

              <div style={{marginTop:4}}>
                <div style={{fontSize:11,fontWeight:600,color:C.soft,textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Sentiment</div>
                {[{l:"Positive",v:78,c:C.green},{l:"Neutral",v:16,c:"#F59E0B"},{l:"Negative",v:6,c:C.accent}].map(s=>(
                  <div key={s.l} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{width:58,fontSize:12,color:C.mid}}>{s.l}</span>
                    <div style={{flex:1,height:6,background:C.hairline,borderRadius:99,overflow:"hidden"}}>
                      <div style={{width:`${s.v}%`,height:"100%",background:s.c,borderRadius:99,transition:"width .9s cubic-bezier(.22,1,.36,1)"}}/>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:s.c,width:32,textAlign:"right"}}>{s.v}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab==="deals"&&(
            <>
              <p style={{fontSize:13,color:C.soft,marginBottom:14}}>💰 Credit card offers & creator promo codes</p>
              {place.deals.length>0
                ?place.deals.map((d,i)=>(
                  <div key={i} style={{display:"flex",gap:14,alignItems:"center",padding:"16px",borderRadius:16,marginBottom:10,background:C.greenBg,border:`1px solid #A7F3D0`,boxShadow:C.s1}}>
                    <span style={{fontSize:26}}>{d.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.green}}>{d.src}</div>
                      <div style={{fontSize:14,fontWeight:600,color:C.ink}}>{d.val}</div>
                    </div>
                    <div style={{fontSize:11,color:C.soft,whiteSpace:"nowrap"}}>Exp {d.exp}</div>
                  </div>
                ))
                :<div style={{textAlign:"center",padding:"40px 20px",color:C.soft}}><div style={{fontSize:40,marginBottom:8}}>🔍</div><div style={{fontSize:14}}>No active deals right now.</div></div>
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Explore screen ───────────────────────────────────────────────────────────
const ExploreScreen = ({ places, visited, onSelect }) => (
  <div style={{flex:1,overflowY:"auto"}}>
    {/* Big header */}
    <div style={{padding:"24px 20px 16px",background:C.surface,borderBottom:`1px solid ${C.hairline}`}}>
      <div style={{fontSize:30,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif",letterSpacing:-.8,marginBottom:2}}>
        Nearby Places
      </div>
      <div style={{fontSize:14,color:C.soft}}>📍 Downtown Core · {places.length} spots</div>
    </div>

    {places.map((p,i)=>{
      const anim=true;
      return (
        <div key={p.id} onClick={()=>onSelect(p)} style={{
          display:"flex",gap:0,overflow:"hidden",
          background:C.surface,borderBottom:`1px solid ${C.hairline}`,
          cursor:"pointer",
        }}>
          {/* Color accent bar */}
          <div style={{width:4,background:p.color,flexShrink:0}}/>
          {/* Content */}
          <div style={{display:"flex",gap:12,padding:"14px 16px",flex:1,alignItems:"center"}}>
            {/* Thumbnail */}
            <div style={{width:64,height:64,borderRadius:16,overflow:"hidden",flexShrink:0,position:"relative"}}>
              <img src={p.hero} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.background=p.color;e.target.style.display="none";}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                <span style={{fontSize:14,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif"}}>{p.name}</span>
                {visited.has(p.id)&&<Chip label="✓" color={C.green} bg={C.greenBg}/>}
              </div>
              <div style={{fontSize:12,color:C.soft,marginBottom:5}}>{p.cat} · {p.dist}</div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                <Stars n={p.rating} size={11}/>
                <span style={{fontSize:12,fontWeight:700,color:"#F59E0B",fontFamily:"'Fraunces',serif"}}>{p.rating.toFixed(1)}</span>
                <span style={{fontSize:11,color:C.soft}}>({p.reviews.toLocaleString()})</span>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {p.videos.some(v=>v.pl==="youtube")&&<Chip label={`▶ YT`} color={C.yt} bg={C.ytBg}/>}
                {p.videos.some(v=>v.pl==="tiktok")&&<Chip label={`♪ TT`} color="#555" bg={C.ttBg}/>}
                {p.deals.length>0&&<Chip label={`💰 Deal`} color={C.green} bg={C.greenBg}/>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:10,color:C.soft,marginBottom:4}}>{p.dist}</div>
              <div style={{fontSize:16,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif"}}>{p.rank===1?"🥇":p.rank===2?"🥈":p.rank===3?"🥉":`#${p.rank}`}</div>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [places,     setPlaces]     = useState(PLACES); // starts with demo data, replaced by real data
  const [loading,    setLoading]    = useState(false);
  const [locErr,     setLocErr]     = useState(null);
  const [userLoc,    setUserLoc]    = useState(null);
  const [mainTab,    setMainTab]    = useState("map");
  const [detail,     setDetail]     = useState(null);
  const [checkInFor, setCheckInFor] = useState(null);
  const [watchVideo, setWatchVideo] = useState(null);
  const [visited,    setVisited]    = useState(new Set());
  const [activePin,  setActivePin]  = useState(null);
  const [search,     setSearch]     = useState("");

  // ── Fetch real nearby places on mount ──────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocErr("Location not supported by this browser. Showing demo data.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLoc({ lat, lng });
        try {
          const res = await fetch(`/api/nearby-places?lat=${lat}&lng=${lng}&type=restaurant&radius=1500`);
          const data = await res.json();
          if (data.places && data.places.length > 0) {
            // Merge real data with structure expected by UI
            const enriched = data.places.map((p, i) => ({
              ...p,
              // Keep emoji/color from demo set if we can match by index, else defaults
              emoji: ["🍽","☕","🍜","🍣","🍸","🥩","🍕","🍔","🌮","🍱"][i % 10],
              hue: ["#E8400C","#7C3AED","#065F46","#C13584","#92400E","#1877F2","#D97706","#059669","#DC2626","#7C3AED"][i % 10],
              hueBg: ["#FEF0EB","#F5F0FE","#ECFDF5","#FEF0F6","#FEF3E2","#EFF6FF","#FFFBEB","#E8F7F0","#FEF2F2","#F5F0FE"][i % 10],
              coords: { // Approximate pin position on our fake map — replaced by real map later
                x: `${20 + (i * 15) % 60}%`,
                y: `${20 + (i * 20) % 55}%`,
              },
              tags: p.tags || [],
              checkins: 0,
            }));
            setPlaces(enriched);
          }
        } catch (err) {
          console.error("Failed to load nearby places:", err);
          setLocErr("Could not load nearby places. Showing demo data.");
        }
        setLoading(false);
      },
      (err) => {
        console.warn("Geolocation denied:", err.message);
        setLocErr("Location access denied. Showing demo data for Metro Manila.");
        // Fall back to Metro Manila BGC coordinates
        const lat = 14.5535, lng = 121.0477;
        setUserLoc({ lat, lng });
        fetch(`/api/nearby-places?lat=${lat}&lng=${lng}&type=restaurant&radius=1500`)
          .then(r => r.json())
          .then(data => {
            if (data.places?.length > 0) {
              const enriched = data.places.map((p, i) => ({
                ...p,
                emoji: ["🍽","☕","🍜","🍣","🍸","🥩","🍕","🍔","🌮","🍱"][i % 10],
                hue: ["#E8400C","#7C3AED","#065F46","#C13584","#92400E"][i % 5],
                hueBg: ["#FEF0EB","#F5F0FE","#ECFDF5","#FEF0F6","#FEF3E2"][i % 5],
                coords: { x: `${20 + (i * 15) % 60}%`, y: `${20 + (i * 20) % 55}%` },
                tags: p.tags || [],
                checkins: 0,
              }));
              setPlaces(enriched);
            }
          })
          .catch(() => {}) // silently keep demo data
          .finally(() => setLoading(false));
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  }, []);

  // ── When a place is opened, fetch real details + YouTube videos ────────────
  const openPlace = async (place) => {
    setDetail(place);
    setActivePin(place.id);

    // Only fetch if we have a real Google place_id (not demo data)
    if (!place.google_place_id) return;

    try {
      // Fetch Google reviews and photos in parallel with YouTube search
      const [detailsRes, youtubeRes] = await Promise.allSettled([
        fetch(`/api/place-details?place_id=${place.google_place_id}`).then(r => r.json()),
        fetch(`/api/youtube-reviews?name=${encodeURIComponent(place.name)}&location=Philippines`).then(r => r.json()),
      ]);

      const details = detailsRes.status === 'fulfilled' ? detailsRes.value.details : null;
      const youtubeVideos = youtubeRes.status === 'fulfilled' ? (youtubeRes.value.videos || []) : [];

      // Build updated place with real data
      const googleReviews = details?.googleReviews || [];
      const allReviews = [...googleReviews, ...(place.feed || [])];

      // Get AI aggregate score if we have any reviews or videos
      let aiScore = null;
      if (googleReviews.length > 0 || youtubeVideos.length > 0) {
        try {
          const scoreRes = await fetch('/api/aggregate-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              placeName: place.name,
              googleReviews,
              youtubeVideos,
              checkinReviews: place.feed?.filter(r => r.pl === 'lp') || [],
            }),
          });
          aiScore = await scoreRes.json();
        } catch (e) {
          console.warn('AI score failed, using Google rating:', e);
        }
      }

      // Update this place in state with all real data
      setPlaces(prev => prev.map(p => {
        if (p.id !== place.id) return p;
        return {
          ...p,
          feed: allReviews,
          videos: youtubeVideos,
          hero: details?.hero || p.hero,
          rating: aiScore?.aggregate_score || details?.rating || p.rating,
          reviews: details?.reviews || p.reviews,
          price: details?.price || p.price,
          tags: aiScore?.tags || p.tags,
          scores: {
            ...p.scores,
            google: aiScore?.per_platform?.google || details?.rating || 0,
            youtube: aiScore?.per_platform?.youtube || 0,
            lp: aiScore?.per_platform?.localpulse || 0,
          },
          aiSummary: aiScore?.summary || null,
          sentiment: aiScore?.sentiment || null,
          open: details?.open ?? p.open,
          hours: details?.hours || [],
          phone: details?.phone || null,
          website: details?.website || null,
        };
      }));

    } catch (err) {
      console.error("Failed to enrich place:", err);
      // Keep whatever data we already have — app still works
    }
  };

  // ── Keep detail in sync after state updates ────────────────────────────────
  useEffect(()=>{
    if(detail){ const f=places.find(p=>p.id===detail.id); if(f) setDetail(f); }
  },[places]);

  const pick = p => openPlace(p);

  const submitReview = (id, {stars,txt}) => {
    setPlaces(prev=>prev.map(p=>{
      if(p.id!==id) return p;
      const nr={pl:"lp",who:ME.name,stars,text:txt,likes:0,ago:"Just now",checkin:true};
      const allF=[nr,...p.feed];
      const lp=allF.filter(r=>r.pl==="lp");
      const lpAvg=lp.reduce((a,r)=>a+r.stars,0)/lp.length;
      const ns={...p.scores,lp:Math.round(lpAvg*10)/10};
      const avg=Object.values(ns).reduce((a,b)=>a+b,0)/6;
      return{...p,feed:allF,checkins:p.checkins+1,reviews:p.reviews+1,scores:ns,rating:Math.round(avg*10)/10};
    }));
    setVisited(prev=>new Set([...prev,id]));
  };

  const filtered = places.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{
      width:"100%",maxWidth:430,margin:"0 auto",
      height:"100vh",display:"flex",flexDirection:"column",
      background:C.bg,position:"relative",overflow:"hidden",
      fontFamily:"'DM Sans',system-ui,sans-serif",
      boxShadow:"0 0 80px rgba(0,0,0,.2)",
    }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{display:none}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        img{transition:opacity .3s}
      `}</style>

      {/* ── Status bar ── */}
      <div style={{
        height:44,flexShrink:0,
        background:C.surface,
        borderBottom:`1px solid ${C.hairline}`,
        display:"flex",alignItems:"center",
        justifyContent:"space-between",
        padding:"0 20px",
      }}>
        <span style={{fontSize:13,fontWeight:700,color:C.ink}}>9:41</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{
            width:30,height:30,borderRadius:"50%",
            background:GRAD,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:14,
          }}>📍</div>
          <span style={{
            fontSize:17,fontWeight:700,color:C.ink,
            fontFamily:"'Fraunces',serif",letterSpacing:-.5,
          }}>LocalPulse</span>
        </div>
        <span style={{fontSize:13,fontWeight:600,color:C.ink}}>●●●</span>
      </div>

      {/* ── Body ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>

        {/* MAP */}
        {mainTab==="map"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* Map */}
            <div style={{flex:1,position:"relative",overflow:"hidden",background:"#EDE8E0"}}>
              <svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
                <rect width="100%" height="100%" fill="#EDE8E0"/>
                <defs><pattern id="g" width="44" height="44" patternUnits="userSpaceOnUse">
                  <path d="M44 0L0 0 0 44" fill="none" stroke="#D8D2C8" strokeWidth=".7"/>
                </pattern></defs>
                <rect width="100%" height="100%" fill="url(#g)"/>
                <rect x="0" y="38%" width="100%" height="24" fill="#D4CCB8" rx="2"/>
                <rect x="0" y="62%" width="100%" height="16" fill="#D4CCB8" rx="2"/>
                <rect x="28%" y="0" width="24" height="100%" fill="#D4CCB8" rx="2"/>
                <rect x="57%" y="0" width="16" height="100%" fill="#D4CCB8" rx="2"/>
                <rect x="0" y="20%" width="100%" height="12" fill="#DDD8CE" rx="1"/>
                <rect x="80%" y="0" width="12" height="100%" fill="#DDD8CE" rx="1"/>
                {[[3,3,22,12],[32,3,22,12],[62,3,14,12],[78,3,18,12],[3,24,22,10],[32,24,22,10],[61,24,14,10],[78,24,16,10],[3,48,22,11],[32,48,22,11],[61,48,13,11],[3,66,22,12],[32,66,22,12],[59,66,16,12],[78,66,16,12]].map(([x,y,w,h],i)=>(
                  <rect key={i} x={`${x}%`} y={`${y}%`} width={`${w}%`} height={`${h}%`} fill="#CDC7B8" rx="3"/>
                ))}
              </svg>

              {places.map(p=><Pin key={p.id} place={p} active={activePin===p.id} onTap={()=>pick(p)}/>)}

              {/* Floating search bar */}
              <div style={{
                position:"absolute",top:14,left:14,right:14,
                display:"flex",alignItems:"center",gap:10,
                background:C.surface,borderRadius:16,
                padding:"11px 16px",
                boxShadow:C.s3,
                border:`1px solid ${C.hairline}`,
              }}>
                <span style={{fontSize:16,color:C.soft}}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Search places…"
                  style={{flex:1,background:"none",border:"none",outline:"none",color:C.ink,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}/>
                {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:C.soft,fontSize:16,cursor:"pointer",padding:0}}>✕</button>}
              </div>

              {/* Loading overlay */}
              {loading && (
                <div style={{position:"absolute",inset:0,background:"rgba(250,250,248,.82)",backdropFilter:"blur(3px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:50}}>
                  <div style={{fontSize:36,marginBottom:12,animation:"spin 1s linear infinite"}}>📍</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.ink,marginBottom:4}}>Finding places near you…</div>
                  <div style={{fontSize:12,color:C.soft}}>Searching Google Places</div>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              )}

              {/* Location error banner */}
              {locErr && !loading && (
                <div style={{position:"absolute",top:72,left:14,right:14,zIndex:40,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"8px 14px",fontSize:12,color:C.mid,display:"flex",alignItems:"center",gap:8}}>
                  <span>⚠️</span><span>{locErr}</span>
                  <button onClick={()=>setLocErr(null)} style={{marginLeft:"auto",background:"none",border:"none",color:C.soft,cursor:"pointer",fontSize:14}}>✕</button>
                </div>
              )}

              {/* AI badge */}
              <div style={{
                position:"absolute",bottom:14,right:14,
                background:C.surface,borderRadius:10,
                padding:"6px 12px",
                boxShadow:C.s1,border:`1px solid ${C.hairline}`,
                display:"flex",alignItems:"center",gap:6,fontSize:11,
              }}>
                <div style={{width:7,height:7,borderRadius:"50%",background:loading?C.soft:C.accent,transition:"background .3s"}}/>
                <span style={{fontWeight:600,color:C.mid}}>{loading?"Loading…":"AI · 6 sources"}</span>
              </div>
            </div>

            {/* Cards strip */}
            <div style={{
              background:C.surface,
              borderTop:`1px solid ${C.hairline}`,
              paddingTop:14,paddingBottom:20,flexShrink:0,
              boxShadow:"0 -4px 20px rgba(15,14,12,.06)",
            }}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",marginBottom:12}}>
                <span style={{fontSize:12,fontWeight:700,color:C.soft,textTransform:"uppercase",letterSpacing:".06em"}}>Nearby · {filtered.length} spots</span>
                <span style={{fontSize:12,color:C.accent,fontWeight:600}}>See all →</span>
              </div>
              <div style={{display:"flex",gap:12,overflowX:"auto",paddingLeft:16,paddingRight:16,paddingBottom:2}}>
                {filtered.map((p,i)=>(
                  <PlaceCard key={p.id} place={p} visited={visited.has(p.id)} onOpen={()=>pick(p)} index={i}/>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* EXPLORE */}
        {mainTab==="explore"&&(
          <ExploreScreen places={filtered} visited={visited} onSelect={pick}/>
        )}

        {/* PROFILE */}
        {mainTab==="profile"&&(
          <div style={{flex:1,overflowY:"auto",background:C.bg}}>
            {/* Profile hero */}
            <div style={{background:GRAD,padding:"32px 20px 60px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-20,right:-20,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
              <div style={{position:"absolute",bottom:-30,left:-30,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,.06)"}}/>
              <div style={{display:"flex",alignItems:"center",gap:14,position:"relative"}}>
                <div style={{width:60,height:60,borderRadius:"50%",background:"rgba(255,255,255,.2)",border:"2.5px solid rgba(255,255,255,.5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:"#fff"}}>{ME.initials}</div>
                <div>
                  <div style={{fontSize:20,fontWeight:700,color:"#fff",fontFamily:"'Fraunces',serif"}}>{ME.name}</div>
                  <div style={{fontSize:13,color:"rgba(255,255,255,.75)"}}>{ME.handle}</div>
                </div>
              </div>
            </div>

            {/* Stats card */}
            <div style={{margin:"-24px 16px 0",background:C.surface,borderRadius:20,padding:"0",boxShadow:C.s2,border:`1px solid ${C.hairline}`,overflow:"hidden",position:"relative",zIndex:1}}>
              <div style={{display:"flex"}}>
                {[{l:"Check-ins",v:visited.size},{l:"Reviews",v:visited.size},{l:"Saved",v:3}].map((s,i)=>(
                  <div key={i} style={{flex:1,padding:"16px 8px",textAlign:"center",borderRight:i<2?`1px solid ${C.hairline}`:"none"}}>
                    <div style={{fontSize:26,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif"}}>{s.v}</div>
                    <div style={{fontSize:11,color:C.soft}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{padding:"24px 16px 32px"}}>
              {visited.size===0?(
                <div style={{textAlign:"center",padding:"40px 20px",color:C.soft}}>
                  <div style={{fontSize:52,marginBottom:14}}>📍</div>
                  <div style={{fontSize:18,fontWeight:700,color:C.mid,fontFamily:"'Fraunces',serif",marginBottom:6}}>No check-ins yet</div>
                  <div style={{fontSize:14,color:C.soft}}>Find a place on the map and check in to start building your food story.</div>
                </div>
              ):(
                <>
                  <div style={{fontSize:16,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif",marginBottom:14}}>Your Check-ins</div>
                  {places.filter(p=>visited.has(p.id)).map(p=>(
                    <div key={p.id} onClick={()=>pick(p)} style={{
                      display:"flex",gap:12,alignItems:"center",
                      background:C.surface,borderRadius:16,padding:"14px",marginBottom:10,
                      boxShadow:C.s1,cursor:"pointer",border:`1px solid ${C.hairline}`,
                    }}>
                      <div style={{width:48,height:48,borderRadius:12,overflow:"hidden",flexShrink:0}}>
                        <img src={p.hero} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.background=p.color;e.target.style.display="none";}}/>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif"}}>{p.name}</div>
                        <div style={{fontSize:12,color:C.soft}}>{p.cat}</div>
                      </div>
                      <Stars n={p.rating} size={12}/>
                    </div>
                  ))}
                </>
              )}

              {/* Sources */}
              <div style={{background:C.surface,borderRadius:18,padding:"16px",boxShadow:C.s1,border:`1px solid ${C.hairline}`,marginTop:8}}>
                <div style={{fontSize:14,fontWeight:700,color:C.ink,fontFamily:"'Fraunces',serif",marginBottom:12}}>Review Sources</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                  {Object.entries(PLAT).map(([k,m])=><Chip key={k} label={m.label} color={m.color} bg={m.bg}/>)}
                </div>
                <div style={{fontSize:12,color:C.soft,lineHeight:1.65}}>Reviews aggregated from YouTube, Instagram, TikTok, Facebook, Google, and verified LocalPulse check-ins. AI-scored by Claude.</div>
              </div>
            </div>
          </div>
        )}

        {/* Overlays */}
        {detail&&!checkInFor&&!watchVideo&&(
          <DetailSheet place={detail} visited={visited.has(detail.id)}
            onCheckIn={()=>setCheckInFor(detail)}
            onClose={()=>{ setDetail(null); setActivePin(null); }}
            onWatchVideo={setWatchVideo}/>
        )}

        {checkInFor&&!watchVideo&&(
          <CheckInSheet place={checkInFor} onClose={()=>setCheckInFor(null)}
            onDone={({stars,txt})=>{ submitReview(checkInFor.id,{stars,txt}); setCheckInFor(null); }}/>
        )}

        {watchVideo&&(
          <VideoPlayer video={watchVideo} onClose={()=>setWatchVideo(null)}/>
        )}
      </div>

      {/* ── Bottom nav ── */}
      <div style={{
        height:76,background:C.surface,
        borderTop:`1px solid ${C.hairline}`,
        display:"flex",alignItems:"center",
        flexShrink:0,paddingBottom:6,
        boxShadow:"0 -1px 0 rgba(15,14,12,.05)",
      }}>
        {[
          {k:"map",     emoji:"🗺",  label:"Map"},
          {k:"explore", emoji:"✦",   label:"Explore"},
          {k:"profile", emoji:"👤",  label:"Profile"},
        ].map(tab=>(
          <button key={tab.k} onClick={()=>setMainTab(tab.k)} style={{
            flex:1,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",
            gap:4,background:"none",border:"none",cursor:"pointer",padding:"10px 0",
          }}>
            {/* Active: gradient pill background */}
            {mainTab===tab.k?(
              <div style={{
                width:44,height:44,borderRadius:14,
                background:GRAD,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:20,
                boxShadow:"0 4px 12px rgba(240,78,35,.3)",
                transform:"translateY(-2px)",
                transition:"transform .2s cubic-bezier(.34,1.56,.64,1)",
              }}>{tab.emoji}</div>
            ):(
              <div style={{width:44,height:44,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.soft}}>{tab.emoji}</div>
            )}
            <span style={{
              fontSize:11,fontWeight:600,
              color:mainTab===tab.k?C.accent:C.soft,
              transition:"color .15s",
            }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
