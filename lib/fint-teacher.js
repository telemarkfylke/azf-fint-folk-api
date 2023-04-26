const graphQlTeacher = require('../fint-templates/teacher')
const { skoleElementIsAktiv, repackNavn, repackSkolear, repackTermin } = require('./repack-fint')
const { fintGraph } = require('./call-fint')
const { logger } = require('@vtfk/logger')

const repackStudent = (elevforhold, contactTeacherGroups) => {
  if (elevforhold.elevforhold) elevforhold = elevforhold.elevforhold // I gruppemedlemskap ligger elevforholdet inne i en prop som heter elevforhold...
  const name = repackNavn(elevforhold.elev.person.navn)
  return {
    navn: name.fulltnavn,
    fornavn: name.fornavn,
    etternavn: name.etternavn,
    feidenavn: elevforhold.elev?.feidenavn?.identifikatorverdi || null,
    kontaktlarer: elevforhold.kontaktlarergruppe.some(group1 => contactTeacherGroups.some(group2 => group1.systemId.identifikatorverdi === group2.systemId))
  }
}

const repackTeacher = (fintTeacher) => {
  const name = repackNavn(fintTeacher.skoleressurs.person.navn)
  const teacher = {
    feidenavn: fintTeacher.skoleressurs.feidenavn.identifikatorverdi,
    navn: name.fulltnavn,
    fornavn: name.fornavn,
    etternavn: name.etternavn,
    fodselsnummer: fintTeacher.skoleressurs.person.fodselsnummer?.identifikatorverdi || null,
    epostadresse: fintTeacher.skoleressurs.person.kontaktinformasjon?.epostadresse || null,
    mobiltelefonnummer: fintTeacher.skoleressurs.person.kontaktinformasjon?.mobiltelefonnummer || null,
    basisgrupper: [],
    kontaktlarergrupper: [],
    undervisningsgrupper: []
  }
  for (const forhold of fintTeacher.skoleressurs.undervisningsforhold) {
    for (const gruppe of forhold.kontaktlarergruppe) {
      if (gruppe.undervisningsforhold.find(f => f.skoleressurs.feidenavn.identifikatorverdi === teacher.feidenavn)) {
        const termin = repackTermin(gruppe.termin)
        const skolear = repackSkolear(gruppe.skolear)
        teacher.kontaktlarergrupper.push({
          navn: gruppe.navn,
          systemId: gruppe.systemId.identifikatorverdi,
          aktiv: skoleElementIsAktiv(skolear, termin),
          periode: gruppe.periode,
          skolenavn: gruppe.skole.navn,
          skolenummer: gruppe.skole.skolenummer?.identifikatorverdi,
          termin,
          skolear,
        })
      }
    }
    for (const gruppe of forhold.basisgruppe) {
      const termin = repackTermin(gruppe.termin)
      const skolear = repackSkolear(gruppe.skolear)
      teacher.basisgrupper.push({
        navn: gruppe.navn,
        systemId: gruppe.systemId.identifikatorverdi,
        aktiv: skoleElementIsAktiv(skolear, termin),
        periode: gruppe.periode,
        trinn: gruppe.trinn.navn,
        skolenavn: gruppe.skole.navn,
        skolenummer: gruppe.skole.skolenummer?.identifikatorverdi,
        termin,
        skolear,
        elever: gruppe.gruppemedlemskap.map(medlem => repackStudent(medlem, teacher.kontaktlarergrupper))
      })
    }
    for (const gruppe of forhold.undervisningsgruppe) {
      const termin = repackTermin(gruppe.termin)
      const skolear = repackSkolear(gruppe.skolear)
      teacher.undervisningsgrupper.push({
        navn: gruppe.navn,
        systemId: gruppe.systemId.identifikatorverdi,
        aktiv: skoleElementIsAktiv(skolear, termin),
        fag: gruppe.fag,
        periode: gruppe.periode,
        skolenavn: gruppe.skole.navn,
        skolenummer: gruppe.skole.skolenummer?.identifikatorverdi,
        termin,
        skolear,
        elever: gruppe.elevforhold.map(elev => repackStudent(elev, teacher.kontaktlarergrupper))
      })
    }
  }
  return teacher
}

module.exports = async (feidenavn) => {
  logger('info', [`Creating graph payload`, 'feidenavn', feidenavn])
  const payload = graphQlTeacher(feidenavn)
  logger('info', ['Created graph payload, sending request to FINT', 'feidenavn', feidenavn])
  const { data } = await fintGraph(payload)
  if (!data.skoleressurs?.person?.navn?.fornavn) {
    logger('info', [`No teacher with feidenavn "${feidenavn}" found in FINT`])
    return null
  }
  logger('info', ['Got response from FINT, repacking result', 'feidenavn', feidenavn])
  const repacked = repackTeacher(data)
  logger('info', ['Repacked result - success', 'feidenavn', feidenavn])
  return { repacked, raw: data }
}