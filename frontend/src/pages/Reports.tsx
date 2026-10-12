import { PageHeader } from '../components/ui'
import { AnalysesTable } from './Analyses'

export default function Reports() {
  return (
    <div>
      <PageHeader title="Reports" />
      <AnalysesTable linkTo="report" />
    </div>
  )
}
