import { useEffect, useState } from "react"
import { dummyGenerationData, PLATFORMS } from "../assets/assets";
import { ArrowRightIcon, CalendarIcon, ClockIcon, HistoryIcon, Loader2Icon, TimerIcon, Wand2Icon, XIcon } from "lucide-react";
import api from "../api/axios";
import toast from "react-hot-toast";


const AIComposer = () => {

  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("Professional");
  const [generateImage, setGenerateImage] = useState(true);
  const [loading, setLoading] = useState(false);
  const [generations, setGenerations] = useState<any[]>([])

   // Scheduling state
   const [activeScheduler, setActiveScheduler] = useState<any>(null);
   const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
   const [scheduledDate, setScheduledDate] = useState("");
   const [scheduledTime, setScheduledTime] = useState("");
   const [scheduling, setScheduling] = useState(false);

   const fetchGenerations = async () => {
    try {
      const { data } = await api.get("api/posts/generations")
      setGenerations(data)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Impossible de récupérer les générations");
    }
   }

   useEffect(()=>{
    fetchGenerations()
   },[])

   const handleGenerate = async ()=>{
    if(!prompt){
      toast.error("Veuillez saisir un prompt");
      return;
    }
    setLoading(true)
    try {
      const { data } = await api.post("/api/posts/generate", {prompt, tone, generateImage});
      setGenerations([data, ...generations]);
      setActiveScheduler(data)
      toast.success("Contenu généré !")
    } catch (error: any) {
       toast.error(error?.response?.data?.message || error?.message || "Échec de la génération");
    }finally{
      setLoading(false)
    }
   }

   const handleSchedule = async ()=>{
    if(!activeScheduler) return;
    if(selectedPlatforms.length === 0){
       toast.error("Sélectionnez au moins une plateforme");
      return;
    }
    if(!scheduledDate || !scheduledTime){
      toast.error("Sélectionnez une date et une heure");
      return;
    }

    const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
    setScheduling(true);
    try {
      await api.post("/api/posts", {
        content: activeScheduler.content,
        mediaUrl: activeScheduler.mediaUrl,
        mediaType: activeScheduler.mediaType,
        platforms: selectedPlatforms,
        scheduledFor,
        status: "scheduled",
      })
        toast.success("Message IA planifié !");
        setActiveScheduler(null)
        setSelectedPlatforms([]);
        setScheduledDate("");
        setScheduledTime("");
    } catch (error:any) {
      toast.error(error?.response?.data?.message || "Échec de la planification");
    }finally{
      setScheduling(false);
    }
   }

   const tones = [
     { id: "Professional", label: "Professionnel" },
     { id: "Creative", label: "Créatif" },
     { id: "Funny", label: "Drôle" },
     { id: "Minimalist", label: "Minimaliste" },
     { id: "Excited", label: "Enthousiaste" }
   ];

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      {/* Input Section */}
      <div className="space-y-6 text-center mt-20">
        <h1 className="text-3xl text-slate-700 tracking-tight">Que devrions-nous créer aujourd'hui ?</h1>
        <div className="relative group mt-12">
          <textarea 
          className="w-full px-6 py-6 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 outline-none focus:border-slate-400 transition resize-none h-40"
          placeholder="Partagez votre idée... (ex: Un message sur le lancement de nos nouveaux grains de café éco-responsables)" value={prompt} onChange={(e)=> setPrompt(e.target.value)}/>
          <div className="absolute bottom-4 right-2.5 flex items-center gap-3 text-sm">

            <button onClick={()=> setGenerateImage(!generateImage)} className="flex items-center gap-3 bg-red-50 py-2 px-3 rounded-lg cursor-pointer">
              <span>Image IA</span>
              <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${generateImage ? "bg-red-500" : "bg-slate-200"}`}>
                <span className={`pointer-events-none size-4 transform translate-y-0.5 rounded-full bg-white transition ${generateImage ? "translate-x-4.5" : "translate-x-0.5"}`}/>
              </div>
            </button>

            <button onClick={handleGenerate} disabled={loading} className="bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer">
              {loading ? (
                <>
                  <Loader2Icon className="size-4 animate-spin"/>
                  <span>Génération...</span>
                </>
              ) : (
                <>
                  Générer
                  <ArrowRightIcon className="size-4"/>
                </>
              )}
            </button>

          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
              {tones.map((t)=>(
                <button key={t.id} onClick={()=> setTone(t.id) } className={`px-4 py-1.5 rounded-full text-sm transition-all border cursor-pointer ${tone === t.id ? "bg-red-500 border-red-500 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {t.label}
                </button>
              ))}
        </div>
      </div>

      {/* AI Generated Posts */}
      <div className="space-y-6 pt-12 border-t border-slate-100">
          <div className="flex items-center justify-between text-slate-600">
            <div className="flex items-center gap-2">
              <HistoryIcon className="size-5"/>
              <h2 className="text-xl">Générations récentes</h2>
            </div>
            <span className="text-sm text-slate-500 bg-slate-50 px-2">{generations.length} au total</span>
          </div>

           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {generations.map((gen)=>(
                <div key={gen._id} className="group bg-white rounded-2xl border border-slate-100 p-5 hover:border-red-200 transition-all relative overflow-hidden">
                  <div className="flex flex-col h-full space-y-4">

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 uppercase tracking-widest">{new Date(gen.createdAt).toLocaleString()}</span>
                      <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-md">
                        {tones.find((t)=>t.id === gen.tone)?.label || gen.tone}
                      </span>
                    </div>

                    <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed flex-1">{gen.content}</p>

                    {gen.mediaUrl && (
                      <div className="rounded-xl overflow-hidden border border-slate-50 bg-slate-50">
                        <img src={gen.mediaUrl} alt="Gen" className="w-full aspect-video object-cover opacity-90 group-hover:opacity-100 transition-opacity"/>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <button 
                      onClick={()=> setActiveScheduler(gen)}
                      className="flex-1 bg-slate-100 hover:bg-red-500 hover:text-white text-slate-600 text-xs py-2.5 rounded-lg transition-all cursor-pointer">
                        Planifier le message
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {
                generations.length === 0 && (
                  <div className="col-span-full py-20 text-center space-y-2">
                    <div className="size-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto text-slate-300">
                      <Wand2Icon className="size-6" />
                    </div>
                    <p className="text-slate-400 text-sm">Aucun contenu généré pour le moment. Essayez de générer du contenu en utilisant l'IA.</p>
                  </div>
                )
              }
          </div>
      </div>

      {/* Scheduler Modal */}
      {activeScheduler && (
        <div className="fixed inset-0 min-h-screen z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">

            <div className="flex items-center justify-between px-8 py-4 border-b border-slate-100 bg-slate-50/30">
              <h3 className="text-slate-900">Planifier la génération</h3>
              <button onClick={()=>setActiveScheduler(null)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer">
                <XIcon className="size-5"/>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">{activeScheduler.prompt}</p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">{activeScheduler.content}</p>
                {activeScheduler.mediaUrl && <img src={activeScheduler.mediaUrl} alt="preview" className="w-full aspect-video object-cover rounded-xl border border-slate-200 shadow-sm"/>}
              </div>
            </div>

            <div className="p-8 bg-slate-50/50 border-t border-slate-50 space-y-8">
              {/* Options */}
              <div className="space-y-6">
                <div>
                  <label className="block text-xs text-slate-600 uppercase tracking-widest mb-4">Sélectionner les canaux</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((p)=>{
                      const active = selectedPlatforms.includes(p.id);
                      return (
                        <button key={p.id} onClick={()=> setSelectedPlatforms((prev)=> (prev.includes(p.id) ? prev.filter((x)=>x !== p.id) : [...prev, p.id]))}
                        className={`p-2.5 rounded-md border text-xs cursor-pointer ${active ? "bg-red-500/80 text-white" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                          <p.icon className="size-4.5"/>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <CalendarIcon className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input type="date" className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-md text-slate-900 text-sm focus:outline-none transition-all" value={scheduledDate} onChange={(e)=>setScheduledDate(e.target.value)}/>
                  </div>
                  <div className="relative">
                    <ClockIcon className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input type="time" className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-md text-slate-900 text-sm focus:outline-none transition-all" value={scheduledTime} onChange={(e)=>setScheduledTime(e.target.value)}/>
                  </div>
                </div>
              </div>
              <button onClick={handleSchedule} className="w-full flex items-center justify-center gap-2 py-3 rounded-md bg-slate-200 text-slate-700 hover:bg-red-500 hover:text-white transition cursor-pointer">
                {scheduling ? <Loader2Icon className="size-4 animate-spin"/> : <TimerIcon className="size-4"/>}
                 Planifier le message
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

export default AIComposer