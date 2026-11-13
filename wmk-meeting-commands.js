/* WMK Meeting Operator: menu de comandos permitido por catálogo, sem eval.
 * Jitsi continua responsável por autenticação/permissões. Um comando emitido
 * não prova que o servidor realizou a ação.
 */
(function(root) {
  "use strict";
  const categories = [
    {id:"basicos",label:"🎛️ Básicos"},
    {id:"visual",label:"🎥 Câmera e visual"},
    {id:"chat",label:"💬 Mensagens"},
    {id:"moderacao",label:"🛡️ Moderador"},
    {id:"turma",label:"📚 Sala e atividades"}
  ];
  const FAVORITES_KEY="wmk.meeting.operator.favorites.v1";
  const commands = [
    {id:"audio",name:"Ligar/desligar meu microfone",group:"basicos",cmd:"toggleAudio"},
    {id:"video",name:"Ligar/desligar minha câmera",group:"basicos",cmd:"toggleVideo"},
    {id:"hand",name:"Levantar/abaixar minha mão",group:"basicos",cmd:"toggleRaiseHand"},
    {id:"screen",name:"Compartilhar/parar minha tela",group:"basicos",cmd:"toggleShareScreen"},
    {id:"exit",name:"Sair da reunião",group:"basicos",cmd:"hangup",confirm:true},
    {id:"tile",name:"Alternar grade de vídeos",group:"visual",cmd:"toggleTileView"},
    {id:"filmstrip",name:"Mostrar/ocultar miniaturas",group:"visual",cmd:"toggleFilmStrip"},
    {id:"participants",name:"Mostrar painel de participantes",group:"visual",cmd:"toggleParticipantsPane",args:()=>[true]},
    {id:"captions",name:"Alternar legendas do Jitsi",group:"visual",cmd:"toggleSubtitles"},
    {id:"chat",name:"Mostrar/ocultar chat da sala",group:"chat",cmd:"toggleChat"},
    {id:"private",name:"Abrir chat privado com selecionado",group:"chat",cmd:"initiatePrivateChat",target:true},
    {id:"allmute",name:"Silenciar microfones de todos",group:"moderacao",cmd:"muteEveryone",moderator:true,confirm:true,args:()=>["audio"]},
    {id:"allvideo",name:"Desligar vídeo dos participantes",group:"moderacao",cmd:"muteEveryone",moderator:true,confirm:true,args:()=>["video"]},
    {id:"mute",name:"Silenciar pessoa selecionada",group:"moderacao",cmd:"muteRemoteParticipant",target:true,moderator:true,confirm:true,args:t=>[t,"audio"]},
    {id:"mutevideo",name:"Desligar vídeo da pessoa selecionada",group:"moderacao",cmd:"muteRemoteParticipant",target:true,moderator:true,confirm:true,args:t=>[t,"video"]},
    {id:"unmute",name:"Pedir para pessoa ligar microfone",group:"moderacao",cmd:"askToUnmute",target:true,moderator:true},
    {id:"kick",name:"Remover participante da reunião",group:"moderacao",cmd:"kickParticipant",target:true,moderator:true,confirm:true},
    {id:"grant",name:"Conceder moderação ao selecionado",group:"moderacao",cmd:"grantModerator",target:true,moderator:true,confirm:true},
    {id:"lobbyon",name:"Solicitar ativação da sala de espera",group:"moderacao",cmd:"toggleLobby",moderator:true,confirm:true,args:()=>[true]},
    {id:"lobbyoff",name:"Solicitar desativação da sala de espera",group:"moderacao",cmd:"toggleLobby",moderator:true,confirm:true,args:()=>[false]},
    {id:"audiomod",name:"Solicitar moderação de áudio",group:"moderacao",cmd:"toggleModeration",moderator:true,confirm:true,args:()=>[true,"audio"]},
    {id:"audiomodoff",name:"Desativar moderação de áudio",group:"moderacao",cmd:"toggleModeration",moderator:true,confirm:true,args:()=>[false,"audio"]},
    {id:"subject",name:"Definir assunto da reunião",group:"turma",cmd:"subject",moderator:true,text:true},
    {id:"room",name:"Criar sala de grupos",group:"turma",cmd:"addBreakoutRoom",moderator:true,text:true},
    {id:"ai",name:"Abrir meu chat WMK de IA",group:"turma",local:"ai"},
    {id:"task",name:"Abrir atividades WMK",group:"turma",local:"tasks"}
  ];
  function mount(api,host,options) {
    if (!api || !host) throw Error("Reunião ou contêiner de comandos indisponível.");
    host.replaceChildren();
    let connected=false,localId=null,role="desconhecido",selectedCategory="basicos",search="",selectedId="";
    let favorites=[];
    try{const stored=JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]");if(Array.isArray(stored))favorites=stored.filter(x=>typeof x==="string"&&commands.some(a=>a.id===x)).slice(0,30)}catch{}
    const participants=new Map(); const log=[]; const opts=options||{};
    const elt=(tag,className,text)=>{
      const n=document.createElement(tag);if(className)n.className=className;
      if(text!==undefined)n.textContent=text;return n;
    };
    const section=elt("section","wmk-op");
    const title=elt("h2","", "WMK • Central de Operadores");
    const subtitle=elt("p","", "Comandos simples e avançados; as permissões são verificadas pelo servidor Jitsi.");
    const status=elt("p","wmk-op-status","Conectando à reunião…");
    status.setAttribute("role","status");
    const select=elt("select","wmk-op-select");
    {const o=elt("option","","⭐ Meus favoritos");o.value="favoritos";select.appendChild(o)}
    select.setAttribute("aria-label","Categoria de comandos");
    for(const x of categories){const o=elt("option","",x.label);o.value=x.id;select.appendChild(o)}
    const input=elt("input","wmk-op-input");input.placeholder="Pesquisar comandos (ex.: silenciar, chat, sala)";
    input.setAttribute("aria-label","Pesquisar comandos");
    const userSelect=elt("select","wmk-op-select");userSelect.setAttribute("aria-label","Participante alvo");
    const list=elt("div","wmk-op-grid");
    const events=elt("details","wmk-op-events");events.appendChild(elt("summary","","Histórico local de solicitações"));
    const eventList=elt("ol","");
    events.appendChild(eventList);
    const fields=elt("div","wmk-op-row");fields.append(select,input);
    const targetRow=elt("div","wmk-op-row");targetRow.append(elt("label","","Participante para comandos individuais:"),userSelect);
    section.append(title,subtitle,status,fields,targetRow,list,events);host.appendChild(section);
    function track(note) {
      log.unshift(new Date().toLocaleTimeString("pt-BR")+" — "+note);
      log.splice(40);
      eventList.replaceChildren();
      for(const line of log) eventList.appendChild(elt("li","",line));
      status.textContent=note;
    }
    function renderTargets(){
      const old=selectedId;
      userSelect.replaceChildren();
      const blank=elt("option","","Selecione uma pessoa");blank.value="";userSelect.appendChild(blank);
      for(const [id,displayName] of participants) {
        if(id===localId)continue;
        const o=elt("option","",displayName+" ("+id.slice(0,9)+")");o.value=id;userSelect.appendChild(o);
      }
      userSelect.value=participants.has(old)&&old!==localId?old:"";
      selectedId=userSelect.value;
    }
    function render(){
      list.replaceChildren();
      const isMod=role==="moderator";
      for(const action of commands.filter(x=>
        (!search|| (x.name+" "+x.cmd+" "+x.id).toLowerCase().includes(search)) &&
        (search||(selectedCategory==="favoritos"?favorites.includes(x.id):x.group===selectedCategory)))) {
        const wrapper=elt("div","wmk-op-card");
        const btn=elt("button","wmk-op-action",action.name);
        const star=elt("button","wmk-op-star",favorites.includes(action.id)?"★ Favorito":"☆ Favoritar");
        star.type="button";
        star.setAttribute("aria-label",(favorites.includes(action.id)?"Remover favorito: ":"Adicionar favorito: ")+action.name);
        star.addEventListener("click",()=>{
          favorites=favorites.includes(action.id)?favorites.filter(x=>x!==action.id):[...favorites,action.id];
          try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(favorites))}catch{track("Não foi possível salvar favoritos neste navegador.")}
          render();
        });
        const needTarget=Boolean(action.target);
        btn.disabled=!connected || (action.moderator&&!isMod) || (needTarget&&!selectedId);
        btn.title=action.moderator&&!isMod?"Exige papel de moderador confirmado pelo Jitsi":needTarget&&!selectedId?"Selecione um participante":"";
        btn.addEventListener("click",()=>run(action));
        wrapper.append(btn,star);list.appendChild(wrapper);
      }
      if(!list.children.length)list.appendChild(elt("p","","Nenhum comando encontrado."));
    }
    function run(action) {
      if(!connected){track("Entre na reunião antes de usar comandos.");return}
      if(action.moderator&&role!=="moderator"){track("Comando restrito: papel de moderador não confirmado.");return}
      if(action.local){
        if(typeof opts.openTool==="function")opts.openTool(action.local);
        track("Painel WMK aberto localmente.");
        return;
      }
      const target=action.target?selectedId:null;
      if(action.target&&(!target||!participants.has(target)||target===localId)){
        track("Selecione um participante remoto válido.");return;
      }
      let args=action.args?action.args(target):action.target?[target]:[];
      if(action.text){
        const label=action.id==="room"?"Nome da sala de grupos":"Assunto da reunião";
        const value=window.prompt(label);if(value===null)return;
        const sanitized=value.trim().slice(0,120);
        if(!sanitized){track("Informe um texto não vazio.");return}
        args=[sanitized];
      }
      if(action.confirm){
        const dest=target?(participants.get(target)||target):"todos";
        if(!window.confirm("Solicitar: "+action.name+"\nAlvo: "+dest+"?\nA autorização final depende do servidor."))return;
      }
      try{
        api.executeCommand(action.cmd,...args);
        track("Solicitação enviada: "+action.name+". Não há confirmação de execução pelo servidor.");
      }catch(err){track("Falha ao solicitar "+action.name+": "+(err?.message||"API indisponível"))}
    }
    select.onchange=()=>{selectedCategory=select.value;render()};
    input.oninput=()=>{search=input.value.trim().toLowerCase();render()};
    userSelect.onchange=()=>{selectedId=userSelect.value;render()};
    const register=(event,callback)=>{if(typeof api.addEventListener==="function")api.addEventListener(event,callback)};
    register("videoConferenceJoined",event=>{
      connected=true;localId=event?.id||null;
      if(localId)participants.set(localId,event?.displayName||"Você");
      renderTargets();track("Conectado. Aguardando confirmação do papel na reunião.");render();
      if(typeof api.getRole==="function"){
        Promise.resolve(api.getRole()).then(r=>{
          if(!connected||typeof r!=="string")return;
          role=r;track("Papel informado pela API: "+r);render();
        }).catch(()=>{});
      }
    });
    register("participantRoleChanged",event=>{
      if(event?.id===localId || (!event?.id&&localId)) {
        role=event.role||"desconhecido";
        track(role==="moderator"?"Papel de moderador informado pelo Jitsi.":"Papel atual: "+role+".");
        render();
      }
    });
    register("participantJoined",event=>{
      if(event?.id)participants.set(event.id,event.displayName||"Participante");
      renderTargets();render();
    });
    register("displayNameChange",event=>{
      if(event?.id&&participants.has(event.id))participants.set(event.id,event.displayname||event.displayName||"Participante");
      renderTargets();
    });
    register("participantLeft",event=>{
      if(event?.id)participants.delete(event.id);
      renderTargets();render();
    });
    register("videoConferenceLeft",()=>{
      connected=false;role="desconhecido";localId=null;participants.clear();renderTargets();track("Reunião encerrada neste dispositivo.");render();
    });
    track("Central iniciada. Aguardando eventos do Jitsi.");render();
    return {dispose(){host.replaceChildren()}};
  }
  root.WMKMeetingCommands={mount,catalog:commands.map(({id,name,group,moderator,target})=>({id,name,group,moderator:!!moderator,target:!!target}))};
})(window);
