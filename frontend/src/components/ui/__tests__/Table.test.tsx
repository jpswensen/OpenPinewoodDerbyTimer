import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Table } from '../Table'

describe('Table', () => {
  it('renders a table element with data', () => {
    render(
      <Table>
        <thead>
          <tr><th>Name</th></tr>
        </thead>
        <tbody>
          <tr><td>Alice</td></tr>
        </tbody>
      </Table>,
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('wraps in overflow container', () => {
    const { container } = render(
      <Table>
        <tbody><tr><td>data</td></tr></tbody>
      </Table>,
    )
    expect(container.querySelector('.overflow-x-auto')).toBeTruthy()
  })

  it('applies additional className', () => {
    render(
      <Table className="my-table">
        <tbody><tr><td>data</td></tr></tbody>
      </Table>,
    )
    expect(screen.getByRole('table').className).toContain('my-table')
  })
})
